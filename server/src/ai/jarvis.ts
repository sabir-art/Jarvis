import Anthropic from "@anthropic-ai/sdk";
import { config, isDemoMode } from "../config.js";
import { getDb, newId, save, logActivity } from "../db/store.js";
import { addNode } from "../brain/graph.js";
import { activeTools } from "../tools/index.js";
import { routeModel, type RoutingDecision } from "./router.js";
import { JARVIS_SYSTEM_PROMPT } from "./prompt.js";
import type { BrainNode } from "../types.js";

/**
 * Cœur conversationnel : boucle agentique en streaming.
 * Chaque tour : routage du modèle → stream Claude → exécution des outils
 * demandés → on reboucle jusqu'à la réponse finale. Les deltas de texte et
 * les événements (outils, nœuds du cerveau) sont poussés au client via SSE.
 */

export type ChatEvent =
  | { type: "meta"; model: string; tier: string; reason: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: string; isError: boolean }
  | { type: "node_added"; node: BrainNode }
  /** Ouvre un panneau riche côté client (e-mails, agenda, musique, note…). */
  | { type: "ui"; panel: string; payload: unknown }
  | { type: "done"; messageId: string; toolsUsed: string[] }
  | { type: "error"; message: string };

export interface ChatInput {
  message: string;
  modelOverride?: string;
  images?: { media_type: string; data: string }[];
  /** vrai si le client SSE a fermé la connexion — on cesse de consommer l'API */
  aborted?: () => boolean;
}

const MAX_TOOL_ITERATIONS = 8;
const HISTORY_TURNS = 20;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

function buildHistory(): Anthropic.MessageParam[] {
  const db = getDb();
  const recent = db.messages.slice(-HISTORY_TURNS);
  // Le premier message envoyé à l'API doit être un message utilisateur.
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  return recent.map((m) => ({
    role: m.role,
    content: m.content || "…",
  }));
}

function userContent(input: ChatInput): Anthropic.MessageParam["content"] {
  if (!input.images?.length) return input.message;
  const blocks: Anthropic.ContentBlockParam[] = input.images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.media_type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
      data: img.data,
    },
  }));
  blocks.push({ type: "text", text: input.message || "Décrivez cette image." });
  return blocks;
}

export async function runChat(input: ChatInput, emit: (e: ChatEvent) => void): Promise<void> {
  // Mode démo (pas de clé API, ou forcé) : moteur local, coût nul.
  if (isDemoMode()) {
    const { runDemoChat } = await import("../demo/engine.js");
    await runDemoChat(input, emit);
    return;
  }

  const db = getDb();
  const routing: RoutingDecision = routeModel(input.message, input.modelOverride);
  emit({ type: "meta", model: routing.model, tier: routing.tier, reason: routing.reason });

  // Persistance du message utilisateur (avant l'appel, pour ne rien perdre).
  db.messages.push({
    id: newId("msg"),
    role: "user",
    content: input.message,
    createdAt: new Date().toISOString(),
  });
  save();

  const tools = activeTools();
  const toolDefs = tools.map((t) => t.definition);
  const toolByName = new Map(tools.map((t) => [t.definition.name, t]));

  const messages: Anthropic.MessageParam[] = [
    ...buildHistory().slice(0, -1), // l'historique contient déjà le message courant en dernier
    { role: "user", content: userContent(input) },
  ];

  const anthropic = getClient();
  const toolsUsed: string[] = [];
  let fullText = "";

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      if (input.aborted?.()) break; // client parti : on ne facture pas dans le vide
      const stream = anthropic.messages.stream({
        model: routing.model,
        max_tokens: 16000,
        system: [
          {
            type: "text",
            text: JARVIS_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: toolDefs,
        messages,
      });

      stream.on("text", (delta) => {
        fullText += delta;
        emit({ type: "text", delta });
      });

      const response = await stream.finalMessage();

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      if (response.stop_reason !== "tool_use") break;

      // Exécution des outils demandés (tous les résultats dans UN message user).
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        emit({ type: "tool_start", name: use.name, input: use.input });
        const tool = toolByName.get(use.name);
        let resultText = `Outil inconnu : ${use.name}`;
        let isError = true;
        if (tool) {
          try {
            const outcome = await tool.handler((use.input ?? {}) as Record<string, unknown>);
            resultText = outcome.result;
            isError = outcome.isError ?? false;
            if (outcome.node) emit({ type: "node_added", node: outcome.node });
            if (outcome.ui) emit({ type: "ui", panel: outcome.ui.panel, payload: outcome.ui.payload });
          } catch (err) {
            resultText = `Échec de l'outil : ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        toolsUsed.push(use.name);
        emit({ type: "tool_result", name: use.name, result: resultText.slice(0, 600), isError });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: resultText,
          ...(isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    const message =
      err instanceof Anthropic.AuthenticationError
        ? "Clé API invalide — vérifiez ANTHROPIC_API_KEY dans le fichier .env."
        : err instanceof Anthropic.RateLimitError
          ? "Limite de débit atteinte côté Anthropic. Réessayez dans un instant."
          : err instanceof Anthropic.APIError
            ? `Erreur API (${err.status ?? "?"}) : ${err.message}`
            : `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`;
    emit({ type: "error", message });
    if (!fullText) {
      // Trace minimale pour garder l'historique cohérent.
      fullText = `⚠️ ${message}`;
    }
  }

  // Persistance de la réponse + nœud « conversation » dans le cerveau.
  const id = newId("msg");
  db.messages.push({
    id,
    role: "assistant",
    content: fullText,
    createdAt: new Date().toISOString(),
    model: routing.model,
    modelReason: routing.reason,
    toolsUsed,
  });
  const convNode = addNode({
    type: "conversation",
    label: input.message.slice(0, 60) || "Échange",
    content: `Q : ${input.message.slice(0, 400)}\n\nR : ${fullText.slice(0, 800)}`,
    tags: [routing.tier],
  });
  emit({ type: "node_added", node: convNode });
  logActivity("chat", `Échange traité par ${routing.model} (${routing.tier}).`);
  save();
  emit({ type: "done", messageId: id, toolsUsed });
}
