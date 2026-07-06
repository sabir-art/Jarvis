import { getDb } from "../db/store.js";
import { tokenize } from "../brain/graph.js";

/**
 * Recherche lexicale TF-IDF sur l'ensemble des connaissances (mémoires, notes,
 * documents, nœuds). Sans clé d'embedding externe, c'est un RAG léger mais
 * fonctionnel ; l'interface `searchKnowledge` permet de brancher plus tard un
 * vrai store vectoriel sans changer les appelants.
 */

interface Searchable {
  id: string;
  kind: string;
  title: string;
  text: string;
}

function corpus(): Searchable[] {
  const db = getDb();
  const items: Searchable[] = [];
  for (const m of db.memories) items.push({ id: m.id, kind: "mémoire", title: m.category, text: m.content });
  for (const n of db.notes) items.push({ id: n.id, kind: "note", title: n.title, text: `${n.title} ${n.content}` });
  for (const d of db.documents) items.push({ id: d.id, kind: "document", title: d.title, text: `${d.title} ${d.content}` });
  for (const t of db.tasks) items.push({ id: t.id, kind: "tâche", title: t.title, text: t.title });
  return items;
}

export function searchKnowledge(query: string, limit = 6): { kind: string; title: string; excerpt: string; score: number }[] {
  const items = corpus();
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || items.length === 0) return [];

  // idf sur le corpus
  const df = new Map<string, number>();
  const docTokens = items.map((it) => {
    const set = new Set(tokenize(it.text));
    for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
    return set;
  });
  const N = items.length;

  const scored = items.map((it, i) => {
    let score = 0;
    for (const q of qTokens) {
      if (docTokens[i].has(q)) score += Math.log(1 + N / (df.get(q) ?? 1));
    }
    return { it, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ it, score }) => ({
      kind: it.kind,
      title: it.title,
      excerpt: it.text.slice(0, 400),
      score: Number(score.toFixed(3)),
    }));
}
