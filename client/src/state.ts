import { create } from "zustand";
import { getJSON, postJSON, streamChat } from "./api";
import { startSpotifyPlayer, type PlayerState } from "./spotify";
import type {
  ActivityEvent,
  BrainEdge,
  BrainNode,
  ConnectorInfo,
  Memory,
  ModelChoice,
  OrbState,
  SkillProposal,
  Task,
  ToolActivity,
  UIMessage,
  ViewName,
  WikiPageSummary,
} from "./types";

interface JarvisState {
  /* navigation & orbe */
  view: ViewName;
  setView: (v: ViewName) => void;
  orbState: OrbState;
  setOrbState: (s: OrbState) => void;
  /** popup riche ouvert par JARVIS (e-mails, agenda, note…) */
  popup: { panel: string; payload: unknown } | null;
  setPopup: (p: { panel: string; payload: unknown } | null) => void;
  /** apparence de l'assistant : orbe ou hologramme */
  persona: "orb" | "hologram";
  setPersona: (p: "orb" | "hologram") => void;

  /* chat */
  messages: UIMessage[];
  streaming: boolean;
  toolActivity: ToolActivity[];
  modelChoice: ModelChoice;
  activeModel: string | null;
  activeModelReason: string | null;
  setModelChoice: (m: ModelChoice) => void;
  sendMessage: (text: string, opts?: { images?: { media_type: string; data: string }[]; viaVoice?: boolean }) => Promise<void>;

  /* voix */
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  wakeEnabled: boolean;
  setWakeEnabled: (v: boolean) => void;

  /* cerveau */
  nodes: BrainNode[];
  edges: BrainEdge[];
  selectedNodeId: string | null;
  flyToNodeId: string | null;
  selectNode: (id: string | null, fly?: boolean) => void;
  clearFlyTo: () => void;

  /* panneaux */
  tasks: Task[];
  memories: Memory[];
  activity: ActivityEvent[];
  proposals: SkillProposal[];
  wikiPages: WikiPageSummary[];
  connectors: ConnectorInfo[];
  apiKeyConfigured: boolean;
  demoMode: boolean;
  toggleTask: (id: string) => Promise<void>;
  reviewProposal: (id: string, decision: "approved" | "rejected") => Promise<void>;

  /* lecteur Spotify intégré (la page JARVIS est un appareil Spotify) */
  spotifyPlayer: PlayerState;

  /* chargement */
  bootstrap: () => Promise<void>;
  refreshPanels: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  refreshConnectors: () => Promise<void>;
}

let uid = 0;
const localId = () => `local_${Date.now()}_${uid++}`;

/** Nettoie grossièrement le markdown pour la synthèse vocale. */
function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (bloc de code) ")
    .replace(/[*_#>`|]/g, "")
    .replace(/^- /gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

let utteranceSeq = 0;
let currentAudio: HTMLAudioElement | null = null;

/** Coupe toute parole en cours (audio neuronal, flux, voix navigateur). */
function stopSpeech(): void {
  utteranceSeq++; // invalide les flux/paroles en cours
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/**
 * JARVIS parle. Voix neuronale d'abord (serveur /api/tts — Edge gratuit ou
 * ElevenLabs), voix du navigateur en repli. Les événements jarvis-tts-start /
 * jarvis-tts-end pilotent l'orbe, l'avatar et la suppression du micro.
 */
function speak(text: string): void {
  stopSpeech(); // les fins des paroles précédentes sont ignorées (jeton)
  const id = ++utteranceSeq;

  let started = false;
  let finished = false;
  const done = () => {
    if (finished || id !== utteranceSeq) return; // une parole plus récente a pris la main
    finished = true;
    const s = useJarvis.getState();
    s.setOrbState(s.streaming ? "thinking" : "idle");
    window.dispatchEvent(new CustomEvent("jarvis-tts-end"));
  };
  const begin = () => {
    started = true;
    if (id !== utteranceSeq) return;
    useJarvis.getState().setOrbState("speaking");
    window.dispatchEvent(new CustomEvent("jarvis-tts-start"));
  };

  const speakWithBrowser = () => {
    if (id !== utteranceSeq) return;
    if (!("speechSynthesis" in window)) {
      done();
      return;
    }
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "fr-FR";
    utt.rate = 1.02;
    utt.pitch = 0.9;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith("fr") && /google|natural|premium|enhanced|siri/i.test(v.name));
    if (voice) utt.voice = voice;
    utt.onstart = begin;
    utt.onend = done;
    utt.onerror = done;
    window.speechSynthesis.speak(utt);
    // Garde-fou : certains environnements acceptent speak() sans jamais
    // émettre d'événement (pas de moteur TTS…) → on libère l'écoute.
    window.setTimeout(() => {
      if (!started) done();
    }, 2000);
  };

  // 1. Voix neuronale via le serveur ; au moindre souci → voix navigateur.
  void (async () => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (id !== utteranceSeq) return;
      if (!res.ok || res.status === 204 || !res.headers.get("content-type")?.includes("audio")) {
        speakWithBrowser();
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (id !== utteranceSeq) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      currentAudio = audio;
      const finish = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        done();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.onplay = begin;
      await audio.play();
    } catch {
      // lecture bloquée (autoplay) ou serveur injoignable
      if (id === utteranceSeq && !started) speakWithBrowser();
    }
  })();
}

/**
 * Parole en flux : JARVIS commence à parler dès la première phrase écrite,
 * sans attendre la fin de la réponse. Le texte streamé est découpé en
 * phrases ; chacune est synthétisée (voix neuronale, repli navigateur) et
 * jouée dans l'ordre — la synthèse de la phrase suivante se prépare pendant
 * que la précédente se joue.
 */
function createSpeechStream(): { push: (delta: string) => void; end: () => void } {
  stopSpeech();
  const id = ++utteranceSeq;

  let textBuf = "";
  let chunkIndex = 0;
  let inputDone = false;
  let pumping = false;
  let anyStarted = false;
  let neuralOk: boolean | null = null; // null = pas encore su
  const chunks: string[] = [];
  let playChain: Promise<void> = Promise.resolve();

  const begin = () => {
    if (id !== utteranceSeq || anyStarted) return;
    anyStarted = true;
    useJarvis.getState().setOrbState("speaking");
    window.dispatchEvent(new CustomEvent("jarvis-tts-start"));
  };
  const finishAll = () => {
    if (id !== utteranceSeq) return;
    const s = useJarvis.getState();
    s.setOrbState(s.streaming ? "thinking" : "idle");
    window.dispatchEvent(new CustomEvent("jarvis-tts-end"));
  };

  /** Synthèse d'un morceau : URL audio neuronale, ou null (voix navigateur). */
  const fetchChunk = async (text: string): Promise<string | null> => {
    if (neuralOk === false) return null;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || res.status === 204 || !res.headers.get("content-type")?.includes("audio")) {
        neuralOk = false;
        return null;
      }
      neuralOk = true;
      return URL.createObjectURL(await res.blob());
    } catch {
      neuralOk = false;
      return null;
    }
  };

  const playItem = (url: string | null, text: string): Promise<void> =>
    new Promise((resolve) => {
      if (id !== utteranceSeq) {
        if (url) URL.revokeObjectURL(url);
        resolve();
        return;
      }
      if (url) {
        const audio = new Audio(url);
        currentAudio = audio;
        const done = () => {
          URL.revokeObjectURL(url);
          if (currentAudio === audio) currentAudio = null;
          resolve();
        };
        audio.onplay = begin;
        audio.onended = done;
        audio.onerror = done;
        void audio.play().catch(done);
        return;
      }
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "fr-FR";
      utt.rate = 1.02;
      utt.pitch = 0.9;
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.startsWith("fr") && /google|natural|premium|enhanced|siri/i.test(v.name));
      if (voice) utt.voice = voice;
      let started = false;
      utt.onstart = () => {
        started = true;
        begin();
      };
      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
      window.setTimeout(() => {
        if (!started) resolve(); // pas de moteur TTS : on n'attend pas
      }, 2500);
    });

  /** Boucle : synthétise les morceaux dans l'ordre, en avance sur la lecture. */
  const pump = async () => {
    if (pumping) return;
    pumping = true;
    while (id === utteranceSeq) {
      const text = chunks.shift();
      if (text === undefined) {
        if (inputDone) break;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const url = await fetchChunk(text); // séquentiel : l'ordre est garanti
      if (id !== utteranceSeq) {
        if (url) URL.revokeObjectURL(url);
        break;
      }
      playChain = playChain.then(() => playItem(url, text));
    }
    await playChain;
    pumping = false;
    if (id === utteranceSeq && inputDone && chunks.length === 0) finishAll();
  };

  /** Découpe le tampon en phrases prêtes à dire. */
  const extract = (force: boolean) => {
    for (;;) {
      // première phrase : on part vite (dès ~40 caractères) ; ensuite on
      // groupe (~180) pour limiter les allers-retours de synthèse
      const minLen = chunkIndex === 0 ? 40 : 180;
      let cut = -1;
      const re = /[.!?…]["»)]?\s|\n+/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(textBuf))) {
        if (match.index + 1 >= minLen) {
          cut = match.index + match[0].length;
          break;
        }
      }
      if (cut === -1 && textBuf.length > 420) {
        const space = textBuf.lastIndexOf(" ", 400);
        cut = space > 200 ? space + 1 : 400;
      }
      if (cut === -1) break;
      const piece = speakable(textBuf.slice(0, cut));
      textBuf = textBuf.slice(cut);
      if (piece) {
        chunks.push(piece);
        chunkIndex++;
      }
    }
    if (force) {
      const piece = speakable(textBuf);
      textBuf = "";
      if (piece) {
        chunks.push(piece);
        chunkIndex++;
      }
    }
  };

  return {
    push: (delta) => {
      if (id !== utteranceSeq) return;
      textBuf += delta;
      extract(false);
      if (chunks.length) void pump();
    },
    end: () => {
      if (id !== utteranceSeq) return;
      inputDone = true;
      extract(true);
      void pump();
    },
  };
}

export const useJarvis = create<JarvisState>((set, get) => ({
  view: "home",
  setView: (v) => set({ view: v }),
  orbState: "idle",
  setOrbState: (s) => set({ orbState: s }),
  popup: null,
  setPopup: (p) => set({ popup: p }),
  persona: (localStorage.getItem("jarvis.persona") as "orb" | "hologram") ?? "orb",
  setPersona: (p) => {
    localStorage.setItem("jarvis.persona", p);
    set({ persona: p });
  },

  messages: [],
  streaming: false,
  toolActivity: [],
  modelChoice: (localStorage.getItem("jarvis.model") as ModelChoice) ?? "auto",
  activeModel: null,
  activeModelReason: null,
  ttsEnabled: localStorage.getItem("jarvis.tts") !== "0",
  wakeEnabled: localStorage.getItem("jarvis.wake") !== "0",

  nodes: [],
  edges: [],
  selectedNodeId: null,
  flyToNodeId: null,

  tasks: [],
  memories: [],
  activity: [],
  proposals: [],
  wikiPages: [],
  connectors: [],
  apiKeyConfigured: true,
  demoMode: false,

  setModelChoice: (m) => {
    localStorage.setItem("jarvis.model", m);
    set({ modelChoice: m });
  },
  setTtsEnabled: (v) => {
    if (!v) stopSpeech();
    localStorage.setItem("jarvis.tts", v ? "1" : "0");
    set({ ttsEnabled: v });
  },
  setWakeEnabled: (v) => {
    localStorage.setItem("jarvis.wake", v ? "1" : "0");
    set({ wakeEnabled: v });
  },

  selectNode: (id, fly = true) =>
    set({ selectedNodeId: id, flyToNodeId: fly && id ? id : null }),
  clearFlyTo: () => set({ flyToNodeId: null }),

  sendMessage: async (text, opts) => {
    if (get().streaming) return;
    const images = opts?.images;
    const viaVoice = opts?.viaVoice ?? false;
    const userMsg: UIMessage = { id: localId(), role: "user", content: text };
    const draft: UIMessage = { id: localId(), role: "assistant", content: "", streaming: true };
    set((s) => ({
      messages: [...s.messages, userMsg, draft],
      streaming: true,
      toolActivity: [],
      orbState: "thinking",
    }));

    const patchDraft = (patch: Partial<UIMessage>) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === draft.id ? { ...m, ...patch } : m)),
      }));

    // À l'oral : on répond à l'oral. Au clavier : seulement si activé.
    // La parole démarre dès la première phrase, sans attendre la fin.
    const speech = viaVoice || get().ttsEnabled ? createSpeechStream() : null;

    await streamChat(
      { message: text, modelOverride: get().modelChoice, images },
      {
        onMeta: (meta) => {
          set({ activeModel: meta.model, activeModelReason: meta.reason });
          patchDraft({ model: meta.model, modelReason: meta.reason });
        },
        onText: (delta) => {
          speech?.push(delta);
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === draft.id ? { ...m, content: m.content + delta } : m,
            ),
          }));
        },
        onToolStart: (name) =>
          set((s) => ({
            toolActivity: [...s.toolActivity.filter((t) => t.name !== name), { name, status: "running" }],
          })),
        onToolResult: (name, _result, isError) =>
          set((s) => ({
            toolActivity: s.toolActivity.map((t) =>
              t.name === name ? { ...t, status: isError ? "error" : "ok" } : t,
            ),
          })),
        onNodeAdded: (node) =>
          set((s) => (s.nodes.some((n) => n.id === node.id) ? {} : { nodes: [...s.nodes, node] })),
        onUi: (panel, payload) => set({ popup: { panel, payload } }),
        onDone: (_id, toolsUsed) => {
          patchDraft({ streaming: false, toolsUsed });
          speech?.end();
        },
        onError: (message) => {
          speech?.end();
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === draft.id
                ? { ...m, streaming: false, content: m.content || `⚠️ ${message}` }
                : m,
            ),
          }));
        },
      },
    ).catch(() => {
      patchDraft({ streaming: false, content: "⚠️ Liaison au serveur impossible." });
    });

    set((s) => ({ streaming: false, orbState: s.orbState === "thinking" ? "idle" : s.orbState }));
    // Les arêtes du graphe et les panneaux se rafraîchissent après chaque tour.
    void get().refreshGraph();
    void get().refreshPanels();
  },

  toggleTask: async (id) => {
    await postJSON(`/api/tasks/${id}/toggle`);
    await get().refreshPanels();
  },

  reviewProposal: async (id, decision) => {
    await postJSON(`/api/selfdev/proposals/${id}/review`, { decision });
    await Promise.all([get().refreshPanels(), get().refreshGraph()]);
  },

  refreshGraph: async () => {
    const g = await getJSON<{ nodes: BrainNode[]; edges: BrainEdge[] }>("/api/brain/graph");
    set({ nodes: g.nodes, edges: g.edges });
  },

  refreshPanels: async () => {
    const [tasks, memories, activity, proposals, wiki] = await Promise.all([
      getJSON<{ tasks: Task[] }>("/api/tasks"),
      getJSON<{ memories: Memory[] }>("/api/memories"),
      getJSON<{ activity: ActivityEvent[] }>("/api/activity"),
      getJSON<{ proposals: SkillProposal[] }>("/api/selfdev/proposals"),
      getJSON<{ pages: WikiPageSummary[] }>("/api/wiki"),
    ]);
    set({
      tasks: tasks.tasks,
      memories: memories.memories,
      activity: activity.activity,
      proposals: proposals.proposals,
      wikiPages: wiki.pages,
    });
  },

  spotifyPlayer: { ready: false, deviceId: null, track: null, paused: true },

  refreshConnectors: async () => {
    const conn = await getJSON<{ connectors: ConnectorInfo[] }>("/api/connectors");
    set({ connectors: conn.connectors });
    maybeStartPlayer(conn.connectors, set);
  },

  bootstrap: async () => {
    try {
      const health = await getJSON<{ apiKeyConfigured: boolean; demoMode: boolean }>("/api/health");
      set({ apiKeyConfigured: health.apiKeyConfigured, demoMode: health.demoMode });
      const conn = await getJSON<{ connectors: ConnectorInfo[] }>("/api/connectors");
      set({ connectors: conn.connectors });
      maybeStartPlayer(conn.connectors, set);
      const msgs = await getJSON<{ messages: UIMessage[] }>("/api/messages");
      set({ messages: msgs.messages });
      await Promise.all([get().refreshGraph(), get().refreshPanels()]);
    } catch {
      set({ apiKeyConfigured: false });
    }
  },
}));

/** Démarre le lecteur intégré dès que le connecteur Spotify est branché. */
function maybeStartPlayer(
  connectors: ConnectorInfo[],
  set: (fn: (s: JarvisState) => Partial<JarvisState>) => void,
): void {
  if (connectors.find((c) => c.id === "spotify")?.status !== "connected") return;
  void startSpotifyPlayer((patch) =>
    set((s) => ({ spotifyPlayer: { ...s.spotifyPlayer, ...patch } })),
  );
}
