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
  /** panneau riche à ouvrir côté client (popup) */
  ui?: { panel: string; payload: unknown };
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
      const note = { id: newId("note"), title, content, tags, createdAt: new Date().toISOString(), nodeId: node.id };
      db.notes.push(note);
      logActivity("note", `Note créée : ${title}`);
      save();
      scheduleWikiIngest({ kind: "note", title, content });
      return { result: `Note « ${title} » créée.`, node, ui: { panel: "note", payload: note } };
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
      return {
        result: `Tâche « ${title} » créée${due ? ` (échéance : ${due})` : ""}.`,
        node,
        ui: { panel: "tasks", payload: db.tasks.filter((t) => !t.done) },
      };
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

/* ── Outils connecteurs ─────────────────────────────────────────────
   Servent les données réelles quand le service est branché (panneau
   Connecteurs), sinon la démo — dans les deux cas ils ouvrent le popup. */

function connectorTool(
  name: string,
  description: string,
  panel: string,
  fetcher: () => Promise<{ data: unknown; live: boolean }>,
  summarize: (data: never, live: boolean) => string,
): JarvisTool {
  return {
    definition: { name, description, input_schema: { type: "object", properties: {} } },
    handler: async () => {
      const { data, live } = await fetcher();
      return {
        result: `${summarize(data as never, live)}${live ? "" : " (démo — service non connecté)"}`,
        ui: { panel, payload: data },
      };
    },
  };
}

const connectorTools: JarvisTool[] = [
  connectorTool(
    "check_emails",
    "Lit la boîte de réception de l'utilisateur (Gmail). À utiliser quand il demande ses e-mails ou messages.",
    "emails",
    async () => {
      const { getEmails } = await import("../connectors/live.js");
      return getEmails();
    },
    (emails: { from: string; subject: string; unread: boolean; time: string }[]) =>
      emails.map((e) => `${e.unread ? "● " : ""}${e.from} — ${e.subject} (${e.time})`).join("\n"),
  ),
  connectorTool(
    "check_calendar",
    "Consulte l'agenda de l'utilisateur (Google Calendar) : rendez-vous du jour et à venir.",
    "agenda",
    async () => {
      const { getEvents } = await import("../connectors/live.js");
      return getEvents();
    },
    (events: { title: string; start: string; end: string; day: string; where: string }[]) =>
      events.map((e) => `${e.day} ${e.start}${e.end ? `–${e.end}` : ""} · ${e.title}${e.where ? ` (${e.where})` : ""}`).join("\n"),
  ),
  connectorTool(
    "search_drive",
    "Liste les fichiers récents du Google Drive de l'utilisateur.",
    "drive",
    async () => {
      const { getDriveFiles } = await import("../connectors/live.js");
      return getDriveFiles();
    },
    (files: { name: string; kind: string; modified: string }[]) =>
      files.map((f) => `${f.name} · ${f.kind}, ${f.modified}`).join("\n"),
  ),
  connectorTool(
    "spotify_status",
    "Musique (Spotify) : lecture en cours, playlists de l'utilisateur.",
    "spotify",
    async () => {
      const { getTracks } = await import("../connectors/live.js");
      return getTracks();
    },
    (t: { nowPlaying: { title: string; artist: string }; playlists: { name: string; tracks: number }[] }) =>
      `En lecture : ${t.nowPlaying.title} — ${t.nowPlaying.artist}\nPlaylists : ${t.playlists.map((p) => `${p.name} (${p.tracks})`).join(", ")}`,
  ),
  {
    definition: {
      name: "play_music",
      description:
        "Lance réellement la musique sur Spotify : piste, artiste ou playlist. À utiliser quand l'utilisateur demande de jouer/mettre de la musique. Query vide = reprendre la lecture.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "Piste, artiste ou playlist demandée (ex. « playlist focus », « Solaris »)." } },
      },
    },
    handler: async (input) => {
      const { playOnSpotify, getTracks } = await import("../connectors/live.js");
      const { isConnected } = await import("../connectors/credstore.js");
      const { data: tracks } = await getTracks();
      if (!isConnected("spotify")) {
        return {
          result: "Spotify n'est pas connecté (lecture simulée). L'utilisateur peut le brancher dans Connecteurs.",
          ui: { panel: "spotify", payload: { ...tracks, playing: tracks.playlists[0] } },
        };
      }
      const outcome = await playOnSpotify(str(input, "query"));
      if (!outcome.ok) {
        const reasons: Record<string, string> = {
          no_device: "Aucun appareil Spotify actif — demander à l'utilisateur d'ouvrir l'app Spotify.",
          premium_required: "La commande à distance exige Spotify Premium.",
          not_found: "Aucun résultat pour cette recherche Spotify.",
        };
        return { result: reasons[outcome.reason] ?? `Échec Spotify : ${outcome.detail}`, isError: true, ui: { panel: "spotify", payload: tracks } };
      }
      const payload =
        outcome.kind === "track"
          ? { ...tracks, nowPlaying: { title: outcome.label, artist: outcome.artist ?? "", album: "" } }
          : tracks;
      return {
        result: `Lecture lancée sur « ${outcome.device} » : ${outcome.label}${outcome.artist ? ` — ${outcome.artist}` : ""}.`,
        ui: { panel: "spotify", payload },
      };
    },
  },
  {
    definition: {
      name: "control_music",
      description:
        "Commande le lecteur Spotify : mettre en pause, reprendre, arrêter, passer au morceau suivant/précédent, régler le volume, ou dire ce qui joue. À utiliser dès que l'utilisateur veut agir sur la musique en cours.",
      input_schema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["pause", "resume", "next", "previous", "volume", "now_playing"],
            description: "pause = pause/stop ; resume = reprendre ; volume = régler (volumePercent requis) ; now_playing = ce qui joue.",
          },
          volumePercent: { type: "number", description: "Volume cible 0-100 (action volume)." },
        },
        required: ["action"],
      },
    },
    handler: async (input) => {
      const { controlSpotify, spotifyPlayerState } = await import("../connectors/live.js");
      const { isConnected } = await import("../connectors/credstore.js");
      if (!isConnected("spotify")) {
        return { result: "Spotify n'est pas connecté — la lecture est simulée, rien à commander. L'utilisateur peut le brancher dans Connecteurs." };
      }
      const action = str(input, "action");
      if (action === "now_playing") {
        const s = await spotifyPlayerState();
        return {
          result: s.track
            ? `${s.playing ? "En lecture" : "En pause"} : ${s.track.title} — ${s.track.artist} (sur ${s.device?.name ?? "?"}, volume ${s.volumePercent ?? "?"}%).`
            : "Rien ne joue actuellement.",
          ui: { panel: "spotify", payload: { nowPlaying: s.track ?? { title: "Rien en lecture", artist: "—" }, playlists: [], queue: [] } },
        };
      }
      const map: Record<string, Parameters<typeof controlSpotify>[0]> = { pause: "pause", resume: "play", next: "next", previous: "previous", volume: "volume" };
      const out = await controlSpotify(map[action] ?? "pause", { volumePercent: Number(input.volumePercent ?? 50) });
      if (!out.ok) return { result: `Échec : ${out.error}`, isError: true };
      const labels: Record<string, string> = {
        pause: "Musique mise en pause.",
        resume: "Lecture reprise.",
        next: "Morceau suivant.",
        previous: "Morceau précédent.",
        volume: `Volume réglé à ${Math.round(Number(input.volumePercent ?? 50))} %.`,
      };
      return { result: labels[action] ?? "Fait." };
    },
  },
  connectorTool(
    "read_slack",
    "Consulte les canaux Slack de l'utilisateur (activité récente).",
    "slack",
    async () => {
      const { getSlackMessages } = await import("../connectors/live.js");
      return getSlackMessages();
    },
    (msgs: { channel: string; from: string; text: string }[]) =>
      msgs.map((s) => `${s.channel} · ${s.from} — ${s.text}`).join("\n"),
  ),
  connectorTool(
    "search_notion",
    "Liste les pages Notion récentes de l'utilisateur.",
    "notion",
    async () => {
      const { getNotionPages } = await import("../connectors/live.js");
      return getNotionPages();
    },
    (pages: { title: string; edited: string }[]) => pages.map((p) => `${p.title} · ${p.edited}`).join("\n"),
  ),
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
  return [...builtinTools, ...connectorTools, ...dynamic];
}
