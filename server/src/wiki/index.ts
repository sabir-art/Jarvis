import Anthropic from "@anthropic-ai/sdk";
import { config, isDemoMode } from "../config.js";
import { getDb, newId, save, logActivity } from "../db/store.js";
import { addNode, updateNode, similarity } from "../brain/graph.js";
import type { WikiPage } from "../types.js";

/**
 * LLM Wiki (d'après le pattern d'Andrej Karpathy) : JARVIS entretient des
 * pages de synthèse markdown, au lieu de seulement stocker des faits bruts.
 *
 *  - ingest : chaque nouvelle source (mémoire, note, document) est intégrée
 *    aux pages pertinentes — créées ou révisées par le modèle.
 *  - query  : l'outil `consult_wiki` sert les pages les plus proches d'une
 *    question, pour des réponses de fond déjà compilées.
 *  - lint   : audit de cohérence de l'ensemble du wiki (contradictions,
 *    doublons, pages orphelines).
 *
 * Les ingestions sont sérialisées (file de promesses) et asynchrones : elles
 * ne ralentissent jamais la conversation.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

const WIKI_SYSTEM = `Vous êtes le bibliothécaire du wiki personnel de l'utilisateur, au service de JARVIS.
Votre mission : entretenir des pages de synthèse markdown, denses, factuelles et interconnectées.

Règles :
- Une page = un sujet durable (une personne, un projet, un domaine, une pratique), jamais un événement ponctuel.
- Mettez à jour les pages existantes plutôt que d'en créer de nouvelles ; créez une page seulement si aucun sujet existant ne convient (1 à 3 pages maximum par ingestion).
- Réécrivez CHAQUE page retournée en ENTIER (le contenu remplace l'ancien) : intégrez la nouvelle information à l'existant sans rien perdre d'important.
- Structure d'une page : un titre H1, un court paragraphe de synthèse, puis des sections H2 concises. Utilisez [[Titre d'une autre page]] pour les renvois croisés.
- Ton neutre et précis, en français. Pas de méta-commentaires. Jamais de secrets (mots de passe, clés).`;

const INGEST_SCHEMA = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string", description: "identifiant-en-kebab-case ; réutiliser le slug d'une page existante pour la mettre à jour" },
          title: { type: "string" },
          content: { type: "string", description: "contenu markdown COMPLET de la page (remplace l'ancien)" },
        },
        required: ["slug", "title", "content"],
        additionalProperties: false,
      },
    },
  },
  required: ["pages"],
  additionalProperties: false,
} as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";
}

export interface WikiSource {
  kind: string;
  title: string;
  content: string;
}

/* File d'ingestion sérialisée — jamais deux appels modèle en parallèle. */
let chain: Promise<void> = Promise.resolve();

export function scheduleWikiIngest(source: WikiSource): void {
  // Mode démo (clé absente OU JARVIS_DEMO=1) : promesse « zéro conso API » tenue.
  if (isDemoMode()) return;
  chain = chain
    .then(() => ingest(source))
    .catch((err) => {
      logActivity("wiki", `Ingestion wiki échouée (${source.title.slice(0, 40)}) : ${err instanceof Error ? err.message : String(err)}`);
    });
}

async function ingest(source: WikiSource): Promise<void> {
  const db = getDb();
  const pages = db.wikiPages;

  // Contexte borné : index complet + contenu des pages les plus proches.
  const probe = `${source.title} ${source.content}`;
  const related = pages
    .map((p) => ({ p, s: similarity(probe, `${p.title} ${p.content}`) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => x.p);

  const index = pages.length
    ? pages.map((p) => `- ${p.slug} — ${p.title}`).join("\n")
    : "(le wiki est vide)";
  const relatedBlock = related.length
    ? related.map((p) => `<page slug="${p.slug}">\n${p.content.slice(0, 4000)}\n</page>`).join("\n\n")
    : "(aucune page proche)";

  const response = await getClient().messages.create({
    model: config.models.balanced,
    max_tokens: 8000,
    system: WIKI_SYSTEM,
    output_config: { format: { type: "json_schema", schema: INGEST_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: `INDEX DU WIKI :\n${index}\n\nPAGES PROCHES (contenu actuel, à réviser si pertinent) :\n${relatedBlock}\n\nNOUVELLE SOURCE À INGÉRER (${source.kind}) — « ${source.title} » :\n${source.content.slice(0, 6000)}\n\nIntégrez cette source au wiki. Retournez les pages créées ou révisées (contenu complet).`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    logActivity("wiki", `Ingestion déclinée par le modèle pour « ${source.title.slice(0, 40)} ».`);
    return;
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: { pages: { slug: string; title: string; content: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    logActivity("wiki", `Réponse wiki illisible pour « ${source.title.slice(0, 40)} ».`);
    return;
  }

  for (const raw of (parsed.pages ?? []).slice(0, 4)) {
    const slug = slugify(raw.slug || raw.title);
    const existing = db.wikiPages.find((p) => p.slug === slug);
    const now = new Date().toISOString();
    if (existing) {
      existing.title = raw.title;
      existing.content = raw.content;
      existing.updatedAt = now;
      if (!existing.sources.includes(source.title)) existing.sources.push(source.title);
      if (existing.nodeId) updateNode(existing.nodeId, { label: raw.title, content: raw.content });
      logActivity("wiki", `Page wiki révisée : ${raw.title}`);
    } else {
      const node = addNode({ type: "wiki", label: raw.title, content: raw.content, tags: ["wiki"] });
      const page: WikiPage = {
        id: newId("wiki"),
        slug,
        title: raw.title,
        content: raw.content,
        sources: [source.title],
        createdAt: now,
        updatedAt: now,
        nodeId: node.id,
      };
      db.wikiPages.push(page);
      logActivity("wiki", `Nouvelle page wiki : ${raw.title}`);
    }
  }
  save();
}

/** Recherche des pages les plus pertinentes pour une question (outil consult_wiki). */
export function queryWiki(query: string, limit = 3): WikiPage[] {
  const db = getDb();
  return db.wikiPages
    .map((p) => ({ p, s: similarity(query, `${p.title} ${p.content}`) }))
    .filter((x) => x.s > 0.05)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Audit de cohérence du wiki entier (contradictions, doublons, orphelins). */
export async function lintWiki(): Promise<string> {
  const db = getDb();
  if (db.wikiPages.length === 0) return "Le wiki est vide — rien à auditer pour l'instant.";
  if (isDemoMode()) return "Mode démo : l'audit de cohérence nécessite le mode complet (clé API), car c'est le modèle qui relit le wiki. Aucun appel n'a été effectué.";

  const corpus = db.wikiPages
    .slice(0, 25)
    .map((p) => `<page slug="${p.slug}" maj="${p.updatedAt}">\n${p.content.slice(0, 3000)}\n</page>`)
    .join("\n\n");

  const response = await getClient().messages.create({
    model: config.models.balanced,
    max_tokens: 4000,
    system: WIKI_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Auditez ce wiki (opération « lint »). Signalez en markdown concis :\n1. contradictions entre pages,\n2. doublons ou pages à fusionner,\n3. renvois [[...]] cassés (pages citées mais inexistantes),\n4. pages trop maigres ou obsolètes.\nSi tout est sain, dites-le en une ligne.\n\n${corpus}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") return "L'audit a été décliné par le modèle.";
  const report = response.content.find((b) => b.type === "text")?.text ?? "(rapport vide)";
  logActivity("wiki", "Audit de cohérence du wiki exécuté (lint).");
  return report;
}
