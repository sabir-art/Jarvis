import type Anthropic from "@anthropic-ai/sdk";
import { getDb, newId, save, logActivity } from "../db/store.js";
import { addNode } from "../brain/graph.js";
import { searchKnowledge } from "../memory/search.js";
import { runJavaScript, runSkillCode } from "./sandbox.js";
import { createProposal, approvedSkills } from "../selfdev/index.js";
import { scheduleWikiIngest, queryWiki } from "../wiki/index.js";
import type { BrainNode } from "../types.js";

/**
 * Système d'outils extensible.
 * Un outil = définition (schéma JSON pour Claude) + handler.
 * Les compétences approuvées via l'auto-dev deviennent des outils dynamiques.
 */

export interface ToolOutcome {
  result: string;
  isError?: boolean;
  /** nœud créé dans le cerveau, à pousser au client en temps réel */
  node?: BrainNode;
}

export interface JarvisTool {
  definition: Anthropic.Tool;
  handler: (input: Record<string, unknown>) => Promise<ToolOutcome>;
}

function str(input: Record<string, unknown>, key: string, fallback = ""): string {
  const v = input[key];
  return typeof v === "string" ? v : fallback;
}

const builtinTools: JarvisTool[] = [
  {
    definition: {
      name: "get_current_datetime",
      description: "Donne la date et l'heure actuelles. À utiliser pour toute question temporelle ou avant de créer une tâche datée.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async () => ({
      result: new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "medium" }),
    }),
  },
  {
    definition: {
      name: "remember",
      description:
        "Mémorise durablement une information sur l'utilisateur (préférence, fait, contexte, personne, projet). À appeler dès que l'utilisateur révèle quelque chose de durable. Jamais de secrets.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "L'information à retenir, formulée à la troisième personne." },
          category: { type: "string", description: "Catégorie courte : préférence, personne, projet, contexte…" },
        },
        required: ["content"],
      },
    },
    handler: async (input) => {
      const db = getDb();
      const content = str(input, "content");
      const category = str(input, "category", "contexte");
      const node = addNode({ type: "memory", label: content.slice(0, 60), content, tags: [category] });
      db.memories.push({ id: newId("mem"), content, category, createdAt: new Date().toISOString(), nodeId: node.id });
      logActivity("memory", `Mémorisé : ${content.slice(0, 80)}`);
      save();
      scheduleWikiIngest({ kind: "mémoire", title: content.slice(0, 60), content });
      return { result: "Information mémorisée et ajoutée au cerveau.", node };
    },
  },
  {
    definition: {
      name: "recall",
      description: "Recherche dans la mémoire et la connaissance de JARVIS (mémoires, notes, documents, tâches). À utiliser avant de dire « je ne sais pas ».",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "Ce que l'on cherche." } },
        required: ["query"],
      },
    },
    handler: async (input) => {
      const hits = searchKnowledge(str(input, "query"));
      if (hits.length === 0) return { result: "Aucun souvenir ni document pertinent." };
      return {
        result: hits.map((h) => `[${h.kind}] ${h.title} — ${h.excerpt.slice(0, 200)}`).join("\n"),
      };
    },
  },
  {
    definition: {
      name: "create_note",
      description: "Crée une note qui se range automatiquement dans le cerveau-sphère.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "content"],
      },
    },
    handler: async (input) => {
      const db = getDb();
      const title = str(input, "title");
      const content = str(input, "content");
      const tags = Array.isArray(input.tags) ? (input.tags as string[]) : [];
      const node = addNode({ type: "note", label: title, content, tags });
      db.notes.push({ id: newId("note"), title, content, tags, createdAt: new Date().toISOString(), nodeId: node.id });
      logActivity("note", `Note créée : ${title}`);
      save();
      scheduleWikiIngest({ kind: "note", title, content });
      return { result: `Note « ${title} » créée.`, node };
    },
  },
  {
    definition: {
      name: "create_task",
      description: "Crée une tâche ou un rappel (avec échéance optionnelle au format ISO ou texte libre).",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          due: { type: "string", description: "Échéance optionnelle (ISO 8601 ou texte, ex. « demain 9h »)." },
        },
        required: ["title"],
      },
    },
    handler: async (input) => {
      const db = getDb();
      const title = str(input, "title");
      const due = str(input, "due") || undefined;
      const node = addNode({ type: "task", label: title, content: due ? `Échéance : ${due}` : "Sans échéance", tags: ["à faire"] });
      db.tasks.push({ id: newId("task"), title, due, done: false, createdAt: new Date().toISOString(), nodeId: node.id });
      logActivity("task", `Tâche créée : ${title}`);
      save();
      return { result: `Tâche « ${title} » créée${due ? ` (échéance : ${due})` : ""}.`, node };
    },
  },
  {
    definition: {
      name: "complete_task",
      description: "Marque une tâche comme terminée, par titre (approximatif accepté).",
      input_schema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
    handler: async (input) => {
      const db = getDb();
      const q = str(input, "title").toLowerCase();
      const task = db.tasks.find((t) => !t.done && t.title.toLowerCase().includes(q));
      if (!task) return { result: "Aucune tâche en cours ne correspond.", isError: true };
      task.done = true;
      logActivity("task", `Tâche terminée : ${task.title}`);
      save();
      return { result: `Tâche « ${task.title} » marquée terminée.` };
    },
  },
  {
    definition: {
      name: "list_tasks",
      description: "Liste les tâches en cours et terminées.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async () => {
      const db = getDb();
      if (db.tasks.length === 0) return { result: "Aucune tâche pour le moment." };
      return {
        result: db.tasks
          .map((t) => `${t.done ? "✔" : "◻"} ${t.title}${t.due ? ` (échéance : ${t.due})` : ""}`)
          .join("\n"),
      };
    },
  },
  {
    definition: {
      name: "search_knowledge",
      description: "Recherche RAG dans les documents et notes indexés de l'utilisateur. Cite les sources dans la réponse.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    handler: async (input) => {
      const hits = searchKnowledge(str(input, "query"), 8);
      if (hits.length === 0) return { result: "Aucun document indexé ne correspond." };
      return {
        result: hits.map((h, i) => `[source ${i + 1} — ${h.kind} « ${h.title} »]\n${h.excerpt}`).join("\n\n"),
      };
    },
  },
  {
    definition: {
      name: "consult_wiki",
      description:
        "Consulte le wiki de synthèses que JARVIS entretient (pattern LLM Wiki) : la connaissance déjà compilée, croisée et à jour. À privilégier pour les questions de fond sur les sujets, projets et personnes que l'utilisateur vous a confiés.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "Le sujet ou la question." } },
        required: ["query"],
      },
    },
    handler: async (input) => {
      const pages = queryWiki(str(input, "query"));
      if (pages.length === 0) {
        return { result: "Aucune page wiki pertinente (le wiki se construit au fil des notes, mémoires et documents)." };
      }
      return {
        result: pages
          .map((p) => `[[${p.title}]] (maj ${p.updatedAt.slice(0, 10)})\n${p.content.slice(0, 1500)}`)
          .join("\n\n---\n\n"),
      };
    },
  },
  {
    definition: {
      name: "web_search",
      description: "Recherche web (réponses instantanées DuckDuckGo). Utile pour définitions, faits, entités. Peut renvoyer peu de résultats — le dire honnêtement le cas échéant.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    handler: async (input) => {
      const query = str(input, "query");
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = (await res.json()) as {
          AbstractText?: string;
          AbstractURL?: string;
          Answer?: string;
          RelatedTopics?: { Text?: string; FirstURL?: string }[];
        };
        const parts: string[] = [];
        if (data.Answer) parts.push(`Réponse : ${data.Answer}`);
        if (data.AbstractText) parts.push(`${data.AbstractText}\nSource : ${data.AbstractURL ?? "n/a"}`);
        for (const t of (data.RelatedTopics ?? []).slice(0, 4)) {
          if (t.Text) parts.push(`• ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
        }
        if (parts.length === 0) return { result: "La recherche n'a rien donné d'exploitable sur ce sujet." };
        const node = addNode({
          type: "search",
          label: `Recherche : ${query.slice(0, 50)}`,
          content: parts.join("\n").slice(0, 1500),
          tags: ["web"],
        });
        logActivity("search", `Recherche web : ${query}`);
        return { result: parts.join("\n\n"), node };
      } catch {
        return { result: "La recherche web est inaccessible pour le moment (réseau).", isError: true };
      }
    },
  },
  {
    definition: {
      name: "run_javascript",
      description:
        "Exécute du JavaScript synchrone dans un bac à sable (Math, JSON, Date… ; pas de réseau ni de fichiers). Idéal pour calculs, conversions, transformations de données. La valeur de la dernière expression est renvoyée.",
      input_schema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
      },
    },
    handler: async (input) => {
      const out = runJavaScript(str(input, "code"));
      logActivity("code", "Exécution de code dans le bac à sable.");
      return { result: out };
    },
  },
  {
    definition: {
      name: "propose_skill",
      description:
        "Auto-développement supervisé : propose un NOUVEL outil pour JARVIS. Fournir le corps JavaScript d'une fonction `async (input) => string` (bac à sable : pas de réseau/fichiers). La proposition sera validée ou rejetée par l'utilisateur avant activation.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "nom_en_snake_case" },
          description: { type: "string", description: "Ce que fait l'outil et quand l'utiliser." },
          code: { type: "string", description: "Corps de la fonction async (input) => string. Terminer par `return ...`." },
          input_schema_json: { type: "string", description: "Schéma JSON (stringifié) des paramètres d'entrée." },
          rationale: { type: "string", description: "Pourquoi cette compétence est utile." },
        },
        required: ["name", "description", "code", "rationale"],
      },
    },
    handler: async (input) => {
      let schema: Record<string, unknown> = { type: "object", properties: {} };
      try {
        const parsed = JSON.parse(str(input, "input_schema_json", "{}"));
        if (parsed && typeof parsed === "object") schema = parsed;
      } catch {
        /* schéma par défaut */
      }
      const p = createProposal({
        name: str(input, "name"),
        description: str(input, "description"),
        code: str(input, "code"),
        inputSchema: schema,
        rationale: str(input, "rationale"),
      });
      const db = getDb();
      const node = db.nodes.find((n) => n.id === p.nodeId);
      return {
        result: `Proposition « ${p.name} » enregistrée (id ${p.id}). Elle attend votre validation dans le panneau Auto-dev.`,
        node,
      };
    },
  },
];

/** Outils actifs = outils natifs + compétences approuvées (auto-dev). */
export function activeTools(): JarvisTool[] {
  const dynamic: JarvisTool[] = approvedSkills().map((skill) => ({
    definition: {
      name: `skill_${skill.name}`,
      description: `${skill.description} (compétence auto-développée, approuvée)`,
      input_schema: (skill.inputSchema && typeof skill.inputSchema === "object"
        ? { type: "object", properties: {}, ...skill.inputSchema }
        : { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
    },
    handler: async (input) => {
      try {
        const out = await runSkillCode(skill.code, input);
        return { result: out };
      } catch (err) {
        return { result: `La compétence a échoué : ${err instanceof Error ? err.message : String(err)}`, isError: true };
      }
    },
  }));
  return [...builtinTools, ...dynamic];
}
