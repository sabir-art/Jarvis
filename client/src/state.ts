import { create } from "zustand";
import { getJSON, postJSON, streamChat } from "./api";
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

/** Coupe toute parole en cours (audio neuronal comme voix navigateur). */
function stopSpeech(): void {
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
  modelChoice: "auto",
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

  setModelChoice: (m) => set({ modelChoice: m }),
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

    await streamChat(
      { message: text, modelOverride: get().modelChoice, images },
      {
        onMeta: (meta) => {
          set({ activeModel: meta.model, activeModelReason: meta.reason });
          patchDraft({ model: meta.model, modelReason: meta.reason });
        },
        onText: (delta) =>
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === draft.id ? { ...m, content: m.content + delta } : m,
            ),
          })),
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
          const finalText = get().messages.find((m) => m.id === draft.id)?.content ?? "";
          // À l'oral : on répond à l'oral. Au clavier : seulement si activé.
          if ((viaVoice || get().ttsEnabled) && finalText) speak(speakable(finalText));
        },
        onError: (message) =>
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === draft.id
                ? { ...m, streaming: false, content: m.content || `⚠️ ${message}` }
                : m,
            ),
          })),
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

  refreshConnectors: async () => {
    const conn = await getJSON<{ connectors: ConnectorInfo[] }>("/api/connectors");
    set({ connectors: conn.connectors });
  },

  bootstrap: async () => {
    try {
      const health = await getJSON<{ apiKeyConfigured: boolean; demoMode: boolean }>("/api/health");
      set({ apiKeyConfigured: health.apiKeyConfigured, demoMode: health.demoMode });
      const conn = await getJSON<{ connectors: ConnectorInfo[] }>("/api/connectors");
      set({ connectors: conn.connectors });
      const msgs = await getJSON<{ messages: UIMessage[] }>("/api/messages");
      set({ messages: msgs.messages });
      await Promise.all([get().refreshGraph(), get().refreshPanels()]);
    } catch {
      set({ apiKeyConfigured: false });
    }
  },
}));
