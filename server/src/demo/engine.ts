import { getDb, newId, save, logActivity } from "../db/store.js";
import { addNode } from "../brain/graph.js";
import { queryWiki } from "../wiki/index.js";
import { searchKnowledge } from "../memory/search.js";
import { getWeather } from "../weather.js";
import { demoCreative, demoFigmaFiles } from "../connectors/index.js";
import {
  getDriveFiles,
  getEmails,
  getEvents,
  getNotionPages,
  getSlackMessages,
  getTracks,
} from "../connectors/live.js";
import type { ChatEvent, ChatInput } from "../ai/jarvis.js";

/**
 * Moteur de démonstration : JARVIS répond localement, sans aucun appel API.
 * La compréhension est double :
 *  1. motifs précis (créations de notes/tâches, formulations classiques) ;
 *  2. score d'intention tolérant — accents ignorés, synonymes, formulations
 *    libres : « montre-moi mes courriels », « c'est quoi mon planning »,
 *    « balance un morceau » fonctionnent sans phrase magique.
 * Les connecteurs branchés servent de vraies données (et commandent
 * réellement Spotify) ; sinon, données simulées clairement étiquetées.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function streamText(text: string, emit: (e: ChatEvent) => void): Promise<void> {
  for (const word of text.split(/(?<=\s)/)) {
    emit({ type: "text", delta: word });
    await sleep(14);
  }
}

interface DemoReply {
  text: string;
  tool?: { name: string; result: string };
  /** panneau riche à ouvrir côté client (popup) */
  ui?: { panel: string; payload: unknown };
  /** action locale réelle (création de note/tâche) */
  act?: () => { text: string; nodeId?: string; ui?: { panel: string; payload: unknown } };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Sans accents ni majuscules : la base d'une compréhension tolérante. */
function strip(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ── Réponses par domaine (réutilisées par motifs ET par score) ── */

async function replyMusic(m: string): Promise<DemoReply> {
  const { isConnected } = await import("../connectors/credstore.js");

  /* Spotify branché : on commande réellement le lecteur. */
  if (isConnected("spotify")) {
    const { playOnSpotify } = await import("../connectors/live.js");
    // ce qui reste une fois les mots de commande retirés = la demande
    const query = strip(m)
      .replace(/\b(jarvis|joue|mets?|lance|allume|balance|play|demarre|ecoutez?|ecouter|j'aimerais|je veux|je voudrais|peux-tu|tu peux|s'il (?:te|vous) plait|stp|svp|en fait|un peu|quelque chose|un truc|de bien)\b/g, " ")
      .replace(/\b(la |le |les |une? |des |du |de |d'|ma |mon |mes |moi )\b/g, " ")
      .replace(/\b(musiques?|music|chansons?|morceaux?|titres?|sons?|zik)\b/g, " ")
      .replace(/\b(dans|sur|avec)?\s*spotify\b/g, " ")
      .replace(/[?!.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const outcome = await playOnSpotify(query);
    const { data: tracks } = await getTracks();

    if (outcome.ok) {
      const payload =
        outcome.kind === "track"
          ? { ...tracks, nowPlaying: { title: outcome.label, artist: outcome.artist ?? "", album: "" } }
          : { ...tracks, playing: { name: outcome.label, tracks: 0, duration: "—" } };
      const launched = outcome.launched ? " (j'ai ouvert Spotify pour vous)" : "";
      const text =
        outcome.kind === "track"
          ? `À vos oreilles, Monsieur : **${outcome.label}**${outcome.artist ? ` de ${outcome.artist}` : ""} — lancé sur « ${outcome.device} »${launched}.`
          : outcome.kind === "playlist"
            ? `C'est parti, Monsieur : playlist **${outcome.label}** sur « ${outcome.device} »${launched}.`
            : `Je relance la lecture sur « ${outcome.device} », Monsieur${launched}.`;
      return {
        tool: { name: "spotify · play_music", result: `lecture : ${outcome.label} (${outcome.device})` },
        ui: { panel: "spotify", payload },
        text,
      };
    }

    const excuse =
      outcome.reason === "no_device"
        ? outcome.launched
          ? "Je viens d'ouvrir Spotify sur votre machine, Monsieur — laissez-lui deux secondes pour s'annoncer, puis redemandez-moi."
          : "Spotify est bien connecté, mais aucun appareil de lecture n'est visible — ouvrez l'application Spotify, puis redemandez-moi."
        : outcome.reason === "premium_required"
          ? "Spotify réserve la commande à distance aux comptes Premium, Monsieur. Lancez la lecture manuellement — je vois ce que vous écoutez et je gère vos playlists."
          : outcome.reason === "not_found"
            ? `Je n'ai rien trouvé pour « ${query} » sur Spotify, Monsieur. Reformulez, ou précisez l'artiste ?`
            : `Spotify me résiste : ${outcome.detail ?? "erreur inconnue"}.`;
    return {
      tool: { name: "spotify · play_music", result: `échec : ${outcome.reason}` },
      ui: { panel: "spotify", payload: tracks },
      text: excuse,
    };
  }

  /* Non branché : démo simulée. */
  const { data: tracks } = await getTracks();
  const mn = strip(m);
  const wanted = tracks.playlists.find((p) => mn.includes(strip(p.name).split(/\s|—/)[0]));
  const playlist = wanted ?? (/focus/.test(mn) ? tracks.playlists[0] : /nuit|night|coding/.test(mn) ? (tracks.playlists[1] ?? tracks.playlists[0]) : tracks.playlists[0]);
  return {
    tool: { name: "spotify · play_music", result: `playlist : ${playlist.name}` },
    ui: { panel: "spotify", payload: { ...tracks, playing: playlist } },
    text: `C'est parti, Monsieur : **${playlist.name}** (${playlist.tracks} titres${playlist.duration !== "—" ? `, ${playlist.duration}` : ""}). *${tracks.nowPlaying.title}* de ${tracks.nowPlaying.artist} ouvre la session.${tracks.queue.length ? ` Ensuite : ${tracks.queue.map((t) => `*${t.title}*`).join(", ")}.` : ""} *(simulation — branchez Spotify pour la vraie lecture)*`,
  };
}

async function replyEmails(): Promise<DemoReply> {
  const { data: emails, live } = await getEmails();
  const unread = emails.filter((e) => e.unread);
  const shown = unread.length ? unread : emails.slice(0, 3);
  return {
    tool: { name: "gmail · check_emails", result: `${live ? "Gmail connecté — " : ""}${unread.length} non lus` },
    ui: { panel: "emails", payload: emails },
    text: `Vous avez **${unread.length} e-mail${unread.length > 1 ? "s" : ""} non lu${unread.length > 1 ? "s" : ""}** :\n\n${shown
      .map((e) => `- **${e.from}** — ${e.subject} · *${e.time}*\n  ${e.preview.slice(0, 90)}…`)
      .join("\n")}${live ? "" : "\n\nLe compte-rendu de Marie Lambert me semble prioritaire — souhaitez-vous que je vous le résume ?"}`,
  };
}

async function replyAgenda(): Promise<DemoReply> {
  const { data: events, live } = await getEvents();
  const today = events.filter((e) => e.day === "aujourd'hui");
  const shown = today.length ? today : events.slice(0, 4);
  return {
    tool: { name: "gcal · check_calendar", result: `${live ? "Agenda connecté — " : ""}${today.length} événements aujourd'hui` },
    ui: { panel: "agenda", payload: events },
    text: `Votre ${today.length ? "journée" : "planning à venir"}, Monsieur :\n\n${shown
      .map((e) => `- **${e.start}${e.end ? `–${e.end}` : ""}** ${e.day !== "aujourd'hui" ? `*(${e.day})* ` : ""}· ${e.title}${e.where ? ` *(${e.where})*` : ""}`)
      .join("\n")}${live ? "" : "\n\nVotre créneau de deep work reste intact jusqu'à 9 h 30. Vendredi, n'oubliez pas la démo investisseurs à 10 h."}`,
  };
}

async function replySlack(): Promise<DemoReply> {
  const { data: messages, live } = await getSlackMessages();
  return {
    tool: { name: "slack · read_channels", result: `${live ? "Slack connecté — " : ""}${messages.length} ${live ? "canaux" : "messages récents"}` },
    ui: { panel: "slack", payload: messages },
    text: `Le pouls de vos équipes, Monsieur :\n\n${messages
      .map((s) => `- **${s.channel}** · ${s.from}${s.time ? `, ${s.time}` : ""} — ${s.text}`)
      .join("\n")}`,
  };
}

async function replyDrive(): Promise<DemoReply> {
  const { data: files, live } = await getDriveFiles();
  return {
    tool: { name: "gdrive · search_files", result: `${live ? "Drive connecté — " : ""}${files.length} fichiers` },
    ui: { panel: "drive", payload: files },
    text: `Voici ce que je trouve dans votre Drive :\n\n${files
      .map((f) => `- **${f.name}** · ${f.kind}, modifié ${f.modified}`)
      .join("\n")}${live ? "" : "\n\nLe « Contrat prestation 2026.pdf » semble correspondre à votre recherche."}`,
  };
}

async function replyNotion(): Promise<DemoReply> {
  const { data: pages, live } = await getNotionPages();
  return {
    tool: { name: "notion · search_pages", result: `${live ? "Notion connecté — " : ""}${pages.length} pages` },
    ui: { panel: "notion", payload: pages },
    text: `Vos pages Notion récentes :\n\n${pages
      .map((p) => `- ${p.icon} **${p.title}** · modifiée ${p.edited}`)
      .join("\n")}`,
  };
}

function replyFigma(): DemoReply {
  return {
    tool: { name: "figma · list_files", result: `${demoFigmaFiles.length} fichiers` },
    ui: { panel: "figma", payload: demoFigmaFiles },
    text: `Vos fichiers Figma :\n\n${demoFigmaFiles
      .map((f) => `- **${f.name}** · ${f.pages} pages, modifié ${f.edited}`)
      .join("\n")}`,
  };
}

function replyChrome(): DemoReply {
  return {
    tool: { name: "chrome · search_history", result: `${demoCreative.chrome.length} entrées` },
    ui: { panel: "chrome", payload: demoCreative.chrome },
    text: `Votre navigation récente :\n\n${demoCreative.chrome
      .map((h) => `- **${h.title}** · ${h.url} — *${h.when}*`)
      .join("\n")}\n\nL'article d'hier soir est le gist de Karpathy sur le pattern LLM Wiki.`,
  };
}

function replyTasks(): DemoReply {
  const tasks = getDb().tasks.filter((t) => !t.done).slice(0, 8);
  return {
    ui: { panel: "tasks", payload: tasks },
    text: tasks.length
      ? `Vos tâches en cours :\n\n${tasks.map((t) => `- ${t.title}${t.due ? ` · *${t.due}*` : ""}`).join("\n")}`
      : "Votre liste est vide. Une journée parfaitement maîtrisée, Monsieur.",
  };
}

async function replyWeather(): Promise<DemoReply> {
  const w = await getWeather();
  return {
    tool: { name: "météo · open-meteo", result: `${w.temperature}° à ${w.city}` },
    ui: { panel: "weather", payload: w },
    text: `Il fait **${w.temperature}°** à ${w.city}, ${w.sky}${w.live ? "" : " (estimation hors-ligne)"}. ${w.temperature < 10 ? "Prévoyez un manteau, Monsieur." : "Une journée tout à fait convenable, Monsieur."}`,
  };
}

function replyTime(): DemoReply {
  const nowStr = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
  return { text: `Nous sommes le ${nowStr}, Monsieur.` };
}

function replyWiki(raw: string): DemoReply | null {
  const q = raw.replace(/^.*?(?:sur|de la|du|de|quoi|est)\s+/i, "");
  const pages = queryWiki(q || raw, 1);
  if (!pages.length) return null;
  return {
    tool: { name: "consult_wiki", result: `page « ${pages[0].title} »` },
    ui: { panel: "wiki", payload: { slug: pages[0].slug, title: pages[0].title, content: pages[0].content } },
    text: `Voici ce que mon wiki compile sur le sujet :\n\n${pages[0].content.slice(0, 900)}\n\n*(page « ${pages[0].title} », entretenue automatiquement)*`,
  };
}

/* ── Score d'intention : comprendre sans phrase magique ─────────── */

type Intent =
  | "music" | "emails" | "agenda" | "slack" | "drive" | "notion"
  | "figma" | "chrome" | "tasks" | "weather" | "time" | "wiki";

/**
 * Chaque domaine a des mots forts (poids 2-3) et des indices (poids 1) ;
 * le domaine au meilleur score (≥ 2) l'emporte. Tout est comparé sans
 * accents : « réunion », « reunion » et « REUNION » se valent.
 */
function detectIntent(mn: string): Intent | null {
  const w = (weight: number, ...words: string[]) =>
    weight * words.filter((x) => new RegExp(`\\b${x}`).test(mn)).length;

  const scores: [Intent, number][] = [
    ["music", w(2, "musique", "music", "chanson", "morceau", "playlist", "spotify", "ecouter", "ecoute", "zik", "volume", "pause") + w(1, "joue", "mets", "lance", "allume", "balance", "play", "son")],
    ["emails", w(2, "mail", "mails", "email", "emails", "courriel", "courriels", "gmail", "inbox", "reception") + w(1, "boite", "recu", "recus", "message", "messages", "messagerie", "lis", "non lus")],
    ["agenda", w(2, "agenda", "calendrier", "rendez", "rdv", "reunion", "reunions", "planning", "meeting") + w(1, "journee", "semaine", "demain", "emploi du temps", "prevu", "prochain", "programme")],
    ["drive", w(3, "drive", "gdrive") + w(1, "fichier", "fichiers", "dossier", "pdf", "contrat", "tableur")],
    ["notion", w(3, "notion") + w(1, "page", "pages")],
    ["slack", w(2, "slack", "canal", "canaux", "channel") + w(1, "equipe", "equipes", "quoi de neuf")],
    ["figma", w(2, "figma", "maquette", "maquettes", "mockup") + w(1, "design")],
    ["chrome", w(2, "chrome", "historique", "navigateur", "onglet", "navigation") + w(1, "article", "rouvre", "site")],
    ["tasks", w(2, "tache", "taches", "todo", "to-do", "a faire") + w(1, "liste", "quoi faire", "rappels")],
    ["weather", w(2, "meteo", "temperature", "pleut", "pluie", "soleil", "degres", "neige", "vent", "fait froid", "fait chaud", "fait beau", "fait combien") + w(1, "temps", "chaud", "froid", "manteau", "parapluie", "dehors")],
    ["time", w(2, "quelle heure", "l'heure", "quel jour", "la date", "on est quand")],
    ["wiki", w(2, "wiki", "synthese", "sais-tu", "sais tu", "connais", "parle-moi", "parle moi", "explique", "c'est quoi", "qui est", "resume")],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] >= 2 ? scores[0][0] : null;
}

async function replyForIntent(intent: Intent, m: string, raw: string): Promise<DemoReply | null> {
  switch (intent) {
    case "music": return replyMusic(m);
    case "emails": return replyEmails();
    case "agenda": return replyAgenda();
    case "slack": return replySlack();
    case "drive": return replyDrive();
    case "notion": return replyNotion();
    case "figma": return replyFigma();
    case "chrome": return replyChrome();
    case "tasks": return replyTasks();
    case "weather": return replyWeather();
    case "time": return replyTime();
    case "wiki": return replyWiki(raw);
  }
}

async function matchIntent(raw: string): Promise<DemoReply> {
  const m = raw.toLowerCase();
  const mn = strip(raw);

  /* ── 1. Créations d'abord (sinon « rappelle-moi de préparer la RÉUNION »
        partirait sur l'agenda, et « note sur cette MUSIQUE » sur Spotify) ── */

  const noteMatch =
    raw.match(/(?:prends?|crée|créer|ajoute|mets?|écris|enregistre)\s+(?:une\s+)?note\s*(?:sur|:|pour|que)?\s*(.+)/i) ??
    raw.match(/\bnote\s+que\s+(.+)/i);
  if (noteMatch) {
    const content = noteMatch[1].trim();
    return {
      act: () => {
        const db = getDb();
        const title = content.slice(0, 50);
        const node = addNode({ type: "note", label: title, content, tags: ["voix"] });
        db.notes.push({ id: newId("note"), title, content, tags: ["voix"], createdAt: new Date().toISOString(), nodeId: node.id });
        logActivity("note", `Note créée : ${title}`);
        save();
        const note = db.notes[db.notes.length - 1];
        return {
          text: `C'est noté, Monsieur : « ${content} ». La note a rejoint votre galaxie.`,
          nodeId: node.id,
          ui: { panel: "note", payload: note },
        };
      },
      text: "",
    };
  }

  /* ── Création de tâche / rappel ── */
  const taskMatch = raw.match(/rappelle[- ]moi\s+(?:de\s+)?(.+)/i) ?? raw.match(/(?:crée|ajoute)\s+(?:une\s+)?tâche\s*:?\s*(.+)/i);
  if (taskMatch) {
    const title = taskMatch[1].trim();
    return {
      act: () => {
        const db = getDb();
        const node = addNode({ type: "task", label: title, content: "Sans échéance", tags: ["à faire"] });
        db.tasks.push({ id: newId("task"), title, done: false, createdAt: new Date().toISOString(), nodeId: node.id });
        logActivity("task", `Tâche créée : ${title}`);
        save();
        return {
          text: `Très bien, Monsieur : « ${title} » est dans votre liste. Je veille au grain.`,
          nodeId: node.id,
          ui: { panel: "tasks", payload: db.tasks.filter((t) => !t.done) },
        };
      },
      text: "",
    };
  }

  /* ── 2. Salutations (avant le score : « ça va ? » n'est pas une intention) ── */
  if (/^(bonjour|bonsoir|salut|hello|hey|coucou|yo)\b[\s!,.]*$/.test(mn) || /\bca va\b|comment vas/.test(mn)) {
    const [{ data: emails }, { data: events }] = await Promise.all([getEmails(), getEvents()]);
    const unread = emails.filter((e) => e.unread).length;
    const today = events.filter((e) => e.day === "aujourd'hui").length;
    return {
      text: pick([
        `Mes salutations, Monsieur. Tous mes systèmes sont opérationnels : ${unread} e-mails non lus, ${today} rendez-vous aujourd'hui. Que puis-je pour vous ?`,
        `Bonjour, Monsieur. Toujours un plaisir. Votre journée compte ${today} rendez-vous. Par quoi commençons-nous ?`,
        `À votre service, Monsieur. La journée s'annonce dense : ${today} rendez-vous, ${unread} e-mails en attente. Vos ordres ?`,
      ]),
    };
  }

  /* ── 3. Capacités / aide ── */
  if (/que (?:peux|sais)[- ]tu faire|\baide\b|\bhelp\b|capacites|fonctionnalites/.test(mn)) {
    return {
      text: `Avec plaisir. En quelques mots :\n\n- **Voix** — dites « Jarvis » puis votre demande, je réponds à l'oral\n- **Musique** — « mets ma playlist Focus » (vraie lecture si Spotify est branché)\n- **E-mails & agenda** — « lis mes e-mails », « mon planning ? »\n- **Notes & tâches** — « note que… », « rappelle-moi de… »\n- **Connaissance** — « que sais-tu sur le projet Alpha ? » (mon wiki compile tout)\n- **Cerveau** — chaque information devient un nœud de votre galaxie\n\n*Mode démo : sans clé API, mes réponses libres sont limitées — les connecteurs branchés, eux, sont bien réels.*`,
    };
  }

  /* ── 4. Score d'intention : compréhension libre ── */
  const intent = detectIntent(mn);
  if (intent) {
    const reply = await replyForIntent(intent, m, raw);
    if (reply) return reply;
  }

  /* ── 5. Connaissance : wiki puis recherche ── */
  if (/wiki|synthese|que sais[- ]tu|parle[- ]moi/.test(mn)) {
    const wiki = replyWiki(raw);
    if (wiki) return wiki;
  }
  if (/cherche|recherche|retrouve|trouve/.test(mn)) {
    const hits = searchKnowledge(raw, 4);
    if (hits.length) {
      return {
        tool: { name: "search_knowledge", result: `${hits.length} résultats` },
        text: `J'ai trouvé ceci dans votre connaissance :\n\n${hits.map((h) => `- **[${h.kind}]** ${h.title}`).join("\n")}\n\nSouhaitez-vous que j'ouvre l'un de ces éléments ?`,
      };
    }
  }

  /* ── 6. Dernier filet : le wiki connaît peut-être le sujet ── */
  const wiki = replyWiki(raw);
  if (wiki && mn.split(" ").length <= 12) return wiki;

  /* ── Par défaut ── */
  return {
    text: pick([
      `J'entends bien, Monsieur. En **mode démonstration**, je réponds sans consommer votre clé API — mes réponses libres sont donc limitées. Essayez : *« mets de la musique »*, *« lis mes e-mails »*, *« quel est mon agenda ? »*, *« note que… »* ou *« que sais-tu sur le projet Alpha ? »*. Une fois votre clé configurée, je répondrai à tout, avec le modèle Claude adapté.`,
      `Voilà qui dépasse mon répertoire de démonstration, Monsieur — je ménage votre budget API. Demandez-moi la musique, vos e-mails, votre agenda, une note, une tâche, ou interrogez mon wiki. Avec une clé API, cette limite disparaît.`,
    ]),
  };
}

export async function runDemoChat(input: ChatInput, emit: (e: ChatEvent) => void): Promise<void> {
  const db = getDb();
  db.messages.push({ id: newId("msg"), role: "user", content: input.message, createdAt: new Date().toISOString() });
  save();

  emit({ type: "meta", model: "jarvis-demo", tier: "démo", reason: "Mode démonstration — aucune consommation API." });
  await sleep(350); // le temps d'une respiration

  const reply = await matchIntent(input.message);
  const toolsUsed: string[] = [];

  if (reply.tool) {
    emit({ type: "tool_start", name: reply.tool.name, input: {} });
    await sleep(450);
    emit({ type: "tool_result", name: reply.tool.name, result: reply.tool.result, isError: false });
    toolsUsed.push(reply.tool.name);
    await sleep(200);
  }

  let text = reply.text;
  let ui = reply.ui;
  if (reply.act) {
    const out = reply.act();
    text = out.text;
    if (out.ui) ui = out.ui;
    if (out.nodeId) {
      const node = db.nodes.find((n) => n.id === out.nodeId);
      if (node) emit({ type: "node_added", node });
    }
  }
  if (ui) emit({ type: "ui", panel: ui.panel, payload: ui.payload });

  await streamText(text, emit);

  const id = newId("msg");
  db.messages.push({
    id,
    role: "assistant",
    content: text,
    createdAt: new Date().toISOString(),
    model: "jarvis-demo",
    modelReason: "Mode démonstration — aucune consommation API.",
    toolsUsed,
  });
  save();
  emit({ type: "done", messageId: id, toolsUsed });
}
