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
 * Les intentions courantes (musique, mails, agenda, notes, tâches, heure,
 * wiki…) sont reconnues par motifs et servies avec les données de démo ou
 * les vrais outils locaux. Le flux SSE est identique au mode réel — l'UI ne
 * voit aucune différence.
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

async function matchIntent(raw: string): Promise<DemoReply> {
  const m = raw.toLowerCase();

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

  /* ── 2. Heure / date / météo ── */
  if (/quelle heure|l'heure|quel jour|la date|aujourd'hui on est/.test(m)) {
    const nowStr = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
    return { text: `Nous sommes le ${nowStr}, Monsieur.` };
  }

  if (/météo|temps qu'il fait|température|quel temps|il fait combien/.test(m)) {
    const w = await getWeather();
    return {
      tool: { name: "météo · open-meteo", result: `${w.temperature}° à ${w.city}` },
      ui: { panel: "weather", payload: w },
      text: `Il fait **${w.temperature}°** à ${w.city}, ${w.sky}${w.live ? "" : " (estimation hors-ligne)"}. ${w.temperature < 10 ? "Prévoyez un manteau, Monsieur." : "Une journée tout à fait convenable, Monsieur."}`,
    };
  }

  /* ── 3. Consultations (connecteurs) ── */

  /* Musique (Spotify) — verbe impératif + objet musical, ou mention explicite de Spotify */
  if (/\b(joue|mets?|lance|play)\b.*\b(musique|playlist|chanson|morceau|titre|spotify|son)\b/.test(m) || /\bspotify\b/.test(m) || /^\s*(de la )?musique\s*[!.]?\s*$/.test(m)) {
    const { data: tracks, live } = await getTracks();
    const wanted = tracks.playlists.find((p) => m.includes(p.name.toLowerCase().split(/\s|—/)[0]));
    const playlist = wanted ?? (/focus/.test(m) ? tracks.playlists[0] : /nuit|night|coding/.test(m) ? (tracks.playlists[1] ?? tracks.playlists[0]) : tracks.playlists[0]);
    return {
      tool: { name: "spotify · play_music", result: `${live ? "Spotify connecté — " : ""}playlist : ${playlist.name}` },
      ui: { panel: "spotify", payload: { ...tracks, playing: playlist } },
      text: `C'est parti, Monsieur : **${playlist.name}** (${playlist.tracks} titres${playlist.duration !== "—" ? `, ${playlist.duration}` : ""}). *${tracks.nowPlaying.title}* de ${tracks.nowPlaying.artist} ${live ? "est sur votre platine" : "ouvre la session"}.${tracks.queue.length ? ` Ensuite : ${tracks.queue.map((t) => `*${t.title}*`).join(", ")}.` : ""}`,
    };
  }

  /* E-mails (Gmail) */
  if (/\b(mails?|e-?mails?|courriels?|gmail)\b|boîte de réception|messages? importants?/.test(m)) {
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

  /* Agenda (Google Calendar) */
  if (/\b(agenda|calendrier|rendez-vous|réunions?|planning)\b|emploi du temps|ma journée|prochain rendez/.test(m)) {
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

  /* Slack */
  if (/\bslack\b|quoi de neuf/.test(m)) {
    const { data: messages, live } = await getSlackMessages();
    return {
      tool: { name: "slack · read_channels", result: `${live ? "Slack connecté — " : ""}${messages.length} ${live ? "canaux" : "messages récents"}` },
      ui: { panel: "slack", payload: messages },
      text: `Le pouls de vos équipes, Monsieur :\n\n${messages
        .map((s) => `- **${s.channel}** · ${s.from}${s.time ? `, ${s.time}` : ""} — ${s.text}`)
        .join("\n")}`,
    };
  }

  /* Google Drive */
  if (/\bdrive\b|mes fichiers|le contrat/.test(m)) {
    const { data: files, live } = await getDriveFiles();
    return {
      tool: { name: "gdrive · search_files", result: `${live ? "Drive connecté — " : ""}${files.length} fichiers` },
      ui: { panel: "drive", payload: files },
      text: `Voici ce que je trouve dans votre Drive :\n\n${files
        .map((f) => `- **${f.name}** · ${f.kind}, modifié ${f.modified}`)
        .join("\n")}${live ? "" : "\n\nLe « Contrat prestation 2026.pdf » semble correspondre à votre recherche."}`,
    };
  }

  /* Notion */
  if (/\bnotion\b/.test(m)) {
    const { data: pages, live } = await getNotionPages();
    return {
      tool: { name: "notion · search_pages", result: `${live ? "Notion connecté — " : ""}${pages.length} pages` },
      ui: { panel: "notion", payload: pages },
      text: `Vos pages Notion récentes :\n\n${pages
        .map((p) => `- ${p.icon} **${p.title}** · modifiée ${p.edited}`)
        .join("\n")}`,
    };
  }

  /* Figma */
  if (/\bfigma\b|maquettes?/.test(m)) {
    return {
      tool: { name: "figma · list_files", result: `${demoFigmaFiles.length} fichiers` },
      ui: { panel: "figma", payload: demoFigmaFiles },
      text: `Vos fichiers Figma :\n\n${demoFigmaFiles
        .map((f) => `- **${f.name}** · ${f.pages} pages, modifié ${f.edited}`)
        .join("\n")}`,
    };
  }

  /* Chrome (historique) */
  if (/\bchrome\b|historique|article d'hier|rouvre/.test(m)) {
    return {
      tool: { name: "chrome · search_history", result: `${demoCreative.chrome.length} entrées` },
      ui: { panel: "chrome", payload: demoCreative.chrome },
      text: `Votre navigation récente :\n\n${demoCreative.chrome
        .map((h) => `- **${h.title}** · ${h.url} — *${h.when}*`)
        .join("\n")}\n\nL'article d'hier soir est le gist de Karpathy sur le pattern LLM Wiki.`,
    };
  }

  /* ── 4. Tâches en cours ── */
  if (/mes tâches|liste.*tâches|quoi faire|to.?do/.test(m)) {
    const tasks = getDb().tasks.filter((t) => !t.done).slice(0, 8);
    return {
      ui: { panel: "tasks", payload: tasks },
      text: tasks.length
        ? `Vos tâches en cours :\n\n${tasks.map((t) => `- ${t.title}${t.due ? ` · *${t.due}*` : ""}`).join("\n")}`
        : "Votre liste est vide. Une journée parfaitement maîtrisée, Monsieur.",
    };
  }

  /* ── Wiki / connaissance ── */
  if (/wiki|synthèse|que sais[- ]tu (?:sur|de)|parle[- ]moi (?:du|de la|de)/.test(m)) {
    const q = raw.replace(/^.*?(?:sur|de la|du|de)\s+/i, "");
    const pages = queryWiki(q || raw, 1);
    if (pages.length) {
      return {
        tool: { name: "consult_wiki", result: `page « ${pages[0].title} »` },
        ui: { panel: "wiki", payload: { slug: pages[0].slug, title: pages[0].title, content: pages[0].content } },
        text: `Voici ce que mon wiki compile sur le sujet :\n\n${pages[0].content.slice(0, 900)}\n\n*(page « ${pages[0].title} », entretenue automatiquement)*`,
      };
    }
  }

  /* ── Recherche dans la connaissance ── */
  if (/cherche|recherche|retrouve/.test(m)) {
    const hits = searchKnowledge(raw, 4);
    if (hits.length) {
      return {
        tool: { name: "search_knowledge", result: `${hits.length} résultats` },
        text: `J'ai trouvé ceci dans votre connaissance :\n\n${hits.map((h) => `- **[${h.kind}]** ${h.title}`).join("\n")}\n\nSouhaitez-vous que j'ouvre l'un de ces éléments ?`,
      };
    }
  }

  /* ── Salutations ── */
  if (/^(bonjour|bonsoir|salut|hello|hey|coucou|yo)\b/.test(m) || /ça va|comment vas/.test(m)) {
    const [{ data: emails }, { data: events }] = await Promise.all([getEmails(), getEvents()]);
    const unread = emails.filter((e) => e.unread).length;
    const today = events.filter((e) => e.day === "aujourd'hui").length;
    return {
      text: pick([
        `Mes salutations, Monsieur. Tous mes systèmes sont opérationnels : ${unread} e-mails non lus, ${today} rendez-vous aujourd'hui. Que puis-je pour vous ?`,
        `Bonjour, Monsieur. Toujours un plaisir. Votre journée compte ${today} rendez-vous — le premier à 9 h 30. Par quoi commençons-nous ?`,
        `À votre service, Monsieur. La journée s'annonce dense : ${today} rendez-vous, ${unread} e-mails en attente. Vos ordres ?`,
      ]),
    };
  }

  /* ── Capacités / aide ── */
  if (/que (?:peux|sais)[- ]tu faire|aide|help|capacités|fonctionnalités/.test(m)) {
    return {
      text: `Avec plaisir. En quelques mots :\n\n- **Voix** — dites « Jarvis » puis votre demande, je réponds à l'oral\n- **Musique** — « mets ma playlist Focus »\n- **E-mails & agenda** — « lis mes e-mails », « mon planning ? »\n- **Notes & tâches** — « note que… », « rappelle-moi de… »\n- **Connaissance** — « que sais-tu sur le projet Alpha ? » (mon wiki compile tout)\n- **Cerveau** — chaque information devient un nœud de votre galaxie\n\n*Mode démo : tout est simulé, votre clé API n'est jamais sollicitée.*`,
    };
  }

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
