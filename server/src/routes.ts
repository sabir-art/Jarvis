import { Router, type Request, type Response } from "express";
import { getDb, newId, save, logActivity } from "./db/store.js";
import { getGraph, addNode } from "./brain/graph.js";
import { runChat, type ChatEvent } from "./ai/jarvis.js";
import { config, hasApiKey } from "./config.js";
import { listProposals, reviewProposal } from "./selfdev/index.js";
import { searchKnowledge } from "./memory/search.js";

export const api = Router();

/* ── Santé & configuration ─────────────────────────────────────── */

api.get("/health", (_req, res) => {
  res.json({
    ok: true,
    apiKeyConfigured: hasApiKey(),
    models: config.models,
  });
});

api.get("/models", (_req, res) => {
  res.json({
    tiers: [
      { tier: "fast", model: config.models.fast, label: "Rapide" },
      { tier: "balanced", model: config.models.balanced, label: "Équilibré" },
      { tier: "deep", model: config.models.deep, label: "Profond" },
    ],
  });
});

/* ── Chat (SSE en streaming) ───────────────────────────────────── */

api.post("/chat", async (req: Request, res: Response) => {
  const { message, modelOverride, images } = req.body ?? {};
  if (typeof message !== "string" || (!message.trim() && !images?.length)) {
    res.status(400).json({ error: "message requis" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const emit = (e: ChatEvent) => {
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };

  try {
    await runChat({ message, modelOverride, images }, emit);
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
});

api.get("/messages", (_req, res) => {
  res.json({ messages: getDb().messages.slice(-100) });
});

/* ── Cerveau ───────────────────────────────────────────────────── */

api.get("/brain/graph", (_req, res) => {
  res.json(getGraph());
});

api.get("/brain/search", (req, res) => {
  const q = String(req.query.q ?? "");
  const db = getDb();
  const ql = q.toLowerCase();
  const hits = q
    ? db.nodes
        .filter((n) => n.label.toLowerCase().includes(ql) || n.content.toLowerCase().includes(ql))
        .slice(0, 12)
    : [];
  res.json({ nodes: hits });
});

/* ── Notes / Tâches / Mémoires / Documents ─────────────────────── */

api.get("/notes", (_req, res) => res.json({ notes: getDb().notes }));
api.get("/tasks", (_req, res) => res.json({ tasks: getDb().tasks }));
api.get("/memories", (_req, res) => res.json({ memories: getDb().memories }));
api.get("/activity", (_req, res) => res.json({ activity: getDb().activity.slice(0, 60) }));

api.post("/tasks/:id/toggle", (req, res) => {
  const db = getDb();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: "tâche introuvable" });
    return;
  }
  task.done = !task.done;
  save();
  res.json({ task });
});

api.get("/documents", (_req, res) => {
  res.json({
    documents: getDb().documents.map((d) => ({ id: d.id, title: d.title, size: d.content.length, createdAt: d.createdAt })),
  });
});

/** Indexation d'un document texte (RAG). */
api.post("/documents", (req, res) => {
  const { title, content } = req.body ?? {};
  if (typeof title !== "string" || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "title et content requis" });
    return;
  }
  const db = getDb();
  const node = addNode({ type: "document", label: title, content: content.slice(0, 2000), tags: ["indexé"] });
  const doc = { id: newId("doc"), title, content, createdAt: new Date().toISOString(), nodeId: node.id };
  db.documents.push(doc);
  logActivity("document", `Document indexé : ${title}`);
  save();
  res.json({ document: { id: doc.id, title: doc.title }, node });
});

api.get("/knowledge/search", (req, res) => {
  res.json({ results: searchKnowledge(String(req.query.q ?? ""), 10) });
});

/* ── Auto-développement supervisé ──────────────────────────────── */

api.get("/selfdev/proposals", (_req, res) => {
  res.json({ proposals: listProposals() });
});

api.post("/selfdev/proposals/:id/review", (req, res) => {
  const decision = req.body?.decision;
  if (decision !== "approved" && decision !== "rejected") {
    res.status(400).json({ error: "decision doit être 'approved' ou 'rejected'" });
    return;
  }
  const p = reviewProposal(req.params.id, decision);
  if (!p) {
    res.status(404).json({ error: "proposition introuvable ou déjà traitée" });
    return;
  }
  res.json({ proposal: p });
});
