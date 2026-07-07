import { Router, type Request, type Response } from "express";
import { getDb, newId, save, logActivity } from "./db/store.js";
import { getGraph, addNode } from "./brain/graph.js";
import { runChat, type ChatEvent } from "./ai/jarvis.js";
import { config, hasApiKey, isDemoMode } from "./config.js";
import { CONNECTORS, connectorPayload, connectorsWithStatus } from "./connectors/index.js";
import { AUTH_SPECS, buildAuthorizeUrl, handleOAuthCallback, testToken } from "./connectors/auth.js";
import { clearCreds, setCreds } from "./connectors/credstore.js";
import { listProposals, reviewProposal } from "./selfdev/index.js";
import { searchKnowledge } from "./memory/search.js";
import { scheduleWikiIngest, lintWiki } from "./wiki/index.js";
import { getWeather } from "./weather.js";

export const api = Router();

/* ── Santé & configuration ─────────────────────────────────────── */

api.get("/health", async (_req, res) => {
  const { ttsStatus } = await import("./tts.js");
  res.json({
    ok: true,
    apiKeyConfigured: hasApiKey(),
    demoMode: isDemoMode(),
    models: config.models,
    tts: ttsStatus(),
  });
});

/* ── Connecteurs ───────────────────────────────────────────────── */

api.get("/connectors", async (_req, res) => {
  res.json({ connectors: await connectorsWithStatus() });
});

api.get("/connectors/:id", async (req, res) => {
  const info = (await connectorsWithStatus()).find((c) => c.id === req.params.id);
  if (!info) {
    res.status(404).json({ error: "connecteur inconnu" });
    return;
  }
  const payload = await connectorPayload(info.id);
  res.json({ connector: info, data: payload?.data ?? null, live: payload?.live ?? false });
});

/**
 * Branchement d'un connecteur.
 *  - jeton simple : { token } → testé auprès du service puis enregistré ;
 *  - OAuth : { clientId, clientSecret } → enregistrés, renvoie l'URL
 *    d'autorisation à ouvrir (le callback finalise la connexion).
 */
api.post("/connectors/:id/credentials", async (req, res) => {
  const id = req.params.id;
  const spec = AUTH_SPECS[id];
  if (!spec) {
    res.status(404).json({ error: "connecteur inconnu" });
    return;
  }
  try {
    if (spec.kind === "token") {
      const token = String(req.body?.token ?? "").trim();
      if (!token) {
        res.status(400).json({ error: "jeton requis" });
        return;
      }
      const { account, verified } = await testToken(id, token);
      setCreds(id, { token, account, connectedAt: new Date().toISOString() });
      logActivity("connector", `Connecteur ${id} branché (${account}).`);
      res.json({ connected: true, account, verified });
    } else if (spec.kind === "oauth") {
      const clientId = String(req.body?.clientId ?? "").trim();
      const clientSecret = String(req.body?.clientSecret ?? "").trim();
      if (!clientId || !clientSecret) {
        res.status(400).json({ error: "clientId et clientSecret requis" });
        return;
      }
      setCreds(id, { clientId, clientSecret });
      res.json({ connected: false, authorizeUrl: buildAuthorizeUrl(id) });
    } else {
      res.status(400).json({ error: "rien à configurer pour ce connecteur" });
    }
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Jeton d'accès Spotify pour le lecteur intégré (Web Playback SDK) :
 * la page JARVIS devient elle-même un appareil Spotify.
 */
api.get("/connectors/spotify/token", async (_req, res) => {
  const { getAccessToken } = await import("./connectors/auth.js");
  const token = await getAccessToken("spotify");
  if (!token) {
    res.status(204).end();
    return;
  }
  res.json({ token });
});

/** État du lecteur Spotify (morceau, progression, appareil) — pour le mini-lecteur. */
api.get("/spotify/player", async (_req, res) => {
  const { spotifyPlayerState } = await import("./connectors/live.js");
  res.json(await spotifyPlayerState());
});

/** Télécommande du lecteur : play, pause, next, previous, seek, transfer. */
api.post("/spotify/player", async (req, res) => {
  const { controlSpotify } = await import("./connectors/live.js");
  const { action, positionMs, deviceId } = req.body ?? {};
  if (!["play", "pause", "next", "previous", "seek", "transfer"].includes(action)) {
    res.status(400).json({ error: "action invalide" });
    return;
  }
  const out = await controlSpotify(action, {
    positionMs: typeof positionMs === "number" ? positionMs : undefined,
    deviceId: typeof deviceId === "string" ? deviceId : undefined,
  });
  res.status(out.ok ? 200 : 422).json(out);
});

/**
 * Ré-autorisation OAuth avec le client ID/secret déjà enregistrés — utile
 * quand les droits demandés évoluent (ex. commande du lecteur Spotify).
 */
api.post("/connectors/:id/reauthorize", (req, res) => {
  try {
    res.json({ authorizeUrl: buildAuthorizeUrl(req.params.id) });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Retour OAuth du fournisseur : échange du code puis petite page de succès. */
api.get("/connectors/:id/callback", async (req, res) => {
  const id = req.params.id;
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const page = (title: string, detail: string, ok: boolean) =>
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <body style="font-family:system-ui;background:#04070d;color:#d7f4ff;display:grid;place-items:center;height:100vh;margin:0">
     <div style="text-align:center;max-width:420px">
       <div style="font-size:42px">${ok ? "✓" : "✕"}</div>
       <h2 style="letter-spacing:.06em">${title}</h2>
       <p style="opacity:.75">${detail}</p>
     </div>
     ${ok ? "<script>setTimeout(()=>window.close(),1800)</script>" : ""}</body>`;
  try {
    if (error) throw new Error(`Autorisation refusée : ${error}`);
    if (!code || !state) throw new Error("code ou state manquant dans le retour OAuth");
    await handleOAuthCallback(id, code, state);
    logActivity("connector", `Connecteur ${id} autorisé via OAuth.`);
    res.send(page("Connecté", "Autorisation réussie — vous pouvez fermer cet onglet et retourner dans JARVIS.", true));
  } catch (err) {
    res
      .status(400)
      .send(page("Échec de connexion", err instanceof Error ? err.message : String(err), false));
  }
});

api.post("/connectors/:id/disconnect", (req, res) => {
  if (!CONNECTORS.some((c) => c.id === req.params.id)) {
    res.status(404).json({ error: "connecteur inconnu" });
    return;
  }
  clearCreds(req.params.id);
  logActivity("connector", `Connecteur ${req.params.id} débranché.`);
  res.json({ connected: false });
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

  let closed = false;
  res.on("close", () => {
    closed = true;
  });

  const emit = (e: ChatEvent) => {
    if (closed) return;
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };

  try {
    await runChat({ message, modelOverride, images, aborted: () => closed }, emit);
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

/** Édition d'une note depuis un popup. */
api.put("/notes/:id", (req, res) => {
  const db = getDb();
  const note = db.notes.find((n) => n.id === req.params.id);
  if (!note) {
    res.status(404).json({ error: "note introuvable" });
    return;
  }
  const { title, content } = req.body ?? {};
  if (typeof title === "string" && title.trim()) note.title = title.trim();
  if (typeof content === "string") note.content = content;
  if (note.nodeId) {
    const node = db.nodes.find((n) => n.id === note.nodeId);
    if (node) {
      node.label = note.title.slice(0, 80);
      node.content = note.content;
    }
  }
  logActivity("note", `Note modifiée : ${note.title}`);
  save();
  res.json({ note });
});

/* ── Synthèse vocale neuronale ─────────────────────────────────── */

/**
 * POST /api/tts {text} → audio MP3 (voix neuronale), ou 204 si aucun
 * fournisseur n'est joignable — le client retombe alors sur la voix du
 * navigateur.
 */
api.post("/tts", async (req, res) => {
  const text = String(req.body?.text ?? "");
  if (!text.trim()) {
    res.status(400).json({ error: "text requis" });
    return;
  }
  const { synthesize } = await import("./tts.js");
  // `voice` optionnel : aperçu d'une voix précise depuis les Réglages
  const v = req.body?.voice;
  const voice =
    v && (v.provider === "elevenlabs" || v.provider === "edge") && typeof v.id === "string"
      ? { provider: v.provider as "elevenlabs" | "edge", id: v.id }
      : undefined;
  const out = await synthesize(text, voice);
  if (!out) {
    res.status(204).end();
    return;
  }
  res.setHeader("Content-Type", out.mime);
  res.setHeader("Cache-Control", "no-store");
  res.send(out.audio);
});

/** Voix disponibles : celles de votre compte ElevenLabs + voix Edge gratuites. */
api.get("/tts/voices", async (_req, res) => {
  const { listElevenLabsVoices, EDGE_VOICES, currentVoice } = await import("./tts.js");
  const { getSettings } = await import("./settings.js");
  const eleven = await listElevenLabsVoices();
  const s = getSettings();
  res.json({
    elevenlabs: eleven, // null = pas de clé ou service injoignable
    edge: EDGE_VOICES,
    current: currentVoice(),
    provider: s.ttsProvider ?? "auto",
  });
});

/** Choix de la voix (persisté). */
api.post("/tts/voice", async (req, res) => {
  const { provider, id, name } = req.body ?? {};
  if (provider !== "elevenlabs" && provider !== "edge") {
    res.status(400).json({ error: "provider doit être 'elevenlabs' ou 'edge'" });
    return;
  }
  if (typeof id !== "string" || !id.trim()) {
    res.status(400).json({ error: "id de voix requis" });
    return;
  }
  const { updateSettings } = await import("./settings.js");
  const patch =
    provider === "elevenlabs"
      ? { ttsProvider: "elevenlabs" as const, elevenVoiceId: id, elevenVoiceName: typeof name === "string" ? name : undefined }
      : { ttsProvider: "edge" as const, edgeVoice: id };
  updateSettings(patch);
  logActivity("system", `Voix de JARVIS : ${typeof name === "string" ? name : id} (${provider}).`);
  const { currentVoice } = await import("./tts.js");
  res.json({ ok: true, current: currentVoice() });
});

/* ── Météo (open-meteo, sans clé ; secours hors-ligne) ─────────── */

api.get("/weather", async (_req, res) => {
  res.json(await getWeather());
});
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
  scheduleWikiIngest({ kind: "document", title, content: content.slice(0, 6000) });
  res.json({ document: { id: doc.id, title: doc.title }, node });
});

api.get("/knowledge/search", (req, res) => {
  res.json({ results: searchKnowledge(String(req.query.q ?? ""), 10) });
});

/* ── Wiki (LLM Wiki : synthèses entretenues par JARVIS) ────────── */

api.get("/wiki", (_req, res) => {
  res.json({
    pages: getDb().wikiPages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      updatedAt: p.updatedAt,
      sources: p.sources.length,
      nodeId: p.nodeId,
    })),
  });
});

api.get("/wiki/:slug", (req, res) => {
  const page = getDb().wikiPages.find((p) => p.slug === req.params.slug);
  if (!page) {
    res.status(404).json({ error: "page introuvable" });
    return;
  }
  res.json({ page });
});

api.post("/wiki/lint", async (_req, res) => {
  try {
    const report = await lintWiki();
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
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
