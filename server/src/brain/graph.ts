import { getDb, newId, save } from "../db/store.js";
import type { BrainEdge, BrainNode, NodeType } from "../types.js";

/**
 * Le cerveau-sphère : un graphe de connaissance.
 * Chaque domaine possède un nœud « hub » ; chaque nouvelle connaissance est
 * rattachée à son hub + reliée sémantiquement aux nœuds les plus proches.
 */

export const HUBS: { id: string; label: string; type: NodeType; description: string }[] = [
  { id: "hub_memory", label: "Mémoire", type: "hub", description: "Ce que JARVIS sait de vous : préférences, faits, contexte." },
  { id: "hub_notes", label: "Notes", type: "hub", description: "Vos notes, rangées et reliées automatiquement." },
  { id: "hub_tasks", label: "Tâches", type: "hub", description: "Agenda, rappels et tâches en cours." },
  { id: "hub_conversations", label: "Conversations", type: "hub", description: "L'historique des échanges avec JARVIS." },
  { id: "hub_search", label: "Recherches", type: "hub", description: "Résultats de recherche et synthèses." },
  { id: "hub_documents", label: "Documents", type: "hub", description: "Documents indexés, interrogeables (RAG)." },
  { id: "hub_skills", label: "Compétences", type: "hub", description: "Les outils et capacités de JARVIS." },
  { id: "hub_system", label: "Système", type: "hub", description: "L'architecture de JARVIS, connue de lui-même." },
  { id: "hub_wiki", label: "Wiki", type: "hub", description: "Synthèses rédigées et entretenues par JARVIS (pattern LLM Wiki) : la connaissance compilée, pas seulement stockée." },
];

const HUB_BY_TYPE: Record<string, string> = {
  memory: "hub_memory",
  note: "hub_notes",
  task: "hub_tasks",
  conversation: "hub_conversations",
  search: "hub_search",
  document: "hub_documents",
  skill: "hub_skills",
  system: "hub_system",
  proposal: "hub_skills",
  wiki: "hub_wiki",
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

export function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.sqrt(ta.size * tb.size);
}

function addEdge(source: string, target: string, kind: BrainEdge["kind"], weight: number): void {
  const db = getDb();
  if (db.edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))) return;
  db.edges.push({ id: newId("edge"), source, target, kind, weight });
}

/** Crée un nœud de connaissance, le rattache à son hub et aux nœuds voisins sémantiquement. */
export function addNode(input: {
  type: NodeType;
  label: string;
  content: string;
  tags?: string[];
  meta?: Record<string, unknown>;
}): BrainNode {
  const db = getDb();
  const cluster = HUB_BY_TYPE[input.type] ?? "hub_system";
  const node: BrainNode = {
    id: newId("node"),
    type: input.type,
    label: input.label.slice(0, 80),
    content: input.content,
    tags: input.tags ?? [],
    cluster,
    createdAt: new Date().toISOString(),
    meta: input.meta,
  };
  db.nodes.push(node);
  addEdge(node.id, cluster, "cluster", 1);

  // Liens sémantiques vers les 2 nœuds non-hub les plus proches.
  const text = `${node.label} ${node.content} ${node.tags.join(" ")}`;
  const scored = db.nodes
    .filter((n) => n.id !== node.id && n.type !== "hub")
    .map((n) => ({ n, s: similarity(text, `${n.label} ${n.content} ${n.tags.join(" ")}`) }))
    .filter((x) => x.s > 0.18)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2);
  for (const { n, s } of scored) addEdge(node.id, n.id, "semantic", s);

  save();
  return node;
}

/** Met à jour un nœud existant (utilisé quand une page wiki est révisée). */
export function updateNode(id: string, patch: { label?: string; content?: string; tags?: string[] }): BrainNode | null {
  const db = getDb();
  const node = db.nodes.find((n) => n.id === id);
  if (!node) return null;
  if (patch.label !== undefined) node.label = patch.label.slice(0, 80);
  if (patch.content !== undefined) node.content = patch.content;
  if (patch.tags !== undefined) node.tags = patch.tags;
  save();
  return node;
}

/** Migration douce : ajoute les hubs manquants sur une base déjà semée. */
export function ensureHubs(): void {
  const db = getDb();
  if (db.nodes.length === 0) return; // seedBrain s'en chargera
  for (const h of HUBS) {
    if (db.nodes.some((n) => n.id === h.id)) continue;
    db.nodes.push({
      id: h.id,
      type: "hub",
      label: h.label,
      content: h.description,
      tags: [],
      cluster: h.id,
      createdAt: new Date().toISOString(),
    });
    addEdge(h.id, "hub_system", "cluster", 0.5);
  }
  save();
}

/** Semence initiale : hubs + nœuds décrivant l'architecture de JARVIS (auto-connaissance). */
export function seedBrain(): void {
  const db = getDb();
  if (db.nodes.length > 0) return;

  for (const h of HUBS) {
    db.nodes.push({
      id: h.id,
      type: "hub",
      label: h.label,
      content: h.description,
      tags: [],
      cluster: h.id,
      createdAt: new Date().toISOString(),
    });
  }
  // Anneau reliant les hubs entre eux (squelette de la sphère).
  for (let i = 0; i < HUBS.length; i++) {
    addEdge(HUBS[i].id, HUBS[(i + 1) % HUBS.length].id, "cluster", 0.5);
  }

  const systemNodes: [string, string][] = [
    ["Routeur de modèles", "JARVIS choisit automatiquement le modèle Claude adapté : Haiku (rapide), Sonnet (équilibré), Opus (raisonnement profond). Surcharge manuelle possible."],
    ["Boucle agentique", "Le serveur exécute une boucle d'appels d'outils (function calling) en streaming : JARVIS peut agir, pas seulement parler."],
    ["Mémoire persistante", "Chaque fait appris, note ou recherche est stocké et devient un nœud navigable du cerveau-sphère."],
    ["Auto-développement supervisé", "JARVIS peut proposer de nouveaux outils, en écrire le code, et les soumettre à validation humaine avant activation."],
    ["Interface cerveau-sphère", "Rendu WebGL (three.js) : sphère 3D zoomable avec zoom sémantique, du macro-cluster au détail d'un nœud."],
  ];
  for (const [label, content] of systemNodes) {
    addNode({ type: "system", label, content, tags: ["architecture"] });
  }
  save();
}

export function getGraph(): { nodes: BrainNode[]; edges: BrainEdge[] } {
  const db = getDb();
  return { nodes: db.nodes, edges: db.edges };
}
