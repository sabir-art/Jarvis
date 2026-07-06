import { create } from "zustand";
import { getJSON, postJSON, streamChat } from "./api";
import type {
  ActivityEvent,
  BrainEdge,
  BrainNode,
  Memory,
  ModelChoice,
  SkillProposal,
  Task,
  ToolActivity,
  UIMessage,
} from "./types";

interface JarvisState {
  /* chat */
  messages: UIMessage[];
  streaming: boolean;
  toolActivity: ToolActivity[];
  modelChoice: ModelChoice;
  activeModel: string | null;
  activeModelReason: string | null;
  setModelChoice: (m: ModelChoice) => void;
  sendMessage: (text: string, images?: { media_type: string; data: string }[]) => Promise<void>;

  /* voix */
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;

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
  apiKeyConfigured: boolean;
  toggleTask: (id: string) => Promise<void>;
  reviewProposal: (id: string, decision: "approved" | "rejected") => Promise<void>;

  /* chargement */
  bootstrap: () => Promise<void>;
  refreshPanels: () => Promise<void>;
  refreshGraph: () => Promise<void>;
}

let uid = 0;
const localId = () => `local_${Date.now()}_${uid++}`;

/** Nettoie grossièrement le markdown pour la synthèse vocale. */
function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (bloc de code) ")
    .replace(/[*_#>`|-]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function speak(text: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "fr-FR";
  utt.rate = 1.02;
  utt.pitch = 0.9;
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith("fr") && /google|natural|premium/i.test(v.name));
  if (voice) utt.voice = voice;
  window.speechSynthesis.speak(utt);
}

export const useJarvis = create<JarvisState>((set, get) => ({
  messages: [],
  streaming: false,
  toolActivity: [],
  modelChoice: "auto",
  activeModel: null,
  activeModelReason: null,
  ttsEnabled: false,

  nodes: [],
  edges: [],
  selectedNodeId: null,
  flyToNodeId: null,

  tasks: [],
  memories: [],
  activity: [],
  proposals: [],
  apiKeyConfigured: true,

  setModelChoice: (m) => set({ modelChoice: m }),
  setTtsEnabled: (v) => {
    if (!v) window.speechSynthesis?.cancel();
    set({ ttsEnabled: v });
  },

  selectNode: (id, fly = true) =>
    set({ selectedNodeId: id, flyToNodeId: fly && id ? id : null }),
  clearFlyTo: () => set({ flyToNodeId: null }),

  sendMessage: async (text, images) => {
    if (get().streaming) return;
    const userMsg: UIMessage = { id: localId(), role: "user", content: text };
    const draft: UIMessage = { id: localId(), role: "assistant", content: "", streaming: true };
    set((s) => ({
      messages: [...s.messages, userMsg, draft],
      streaming: true,
      toolActivity: [],
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
        onDone: (_id, toolsUsed) => {
          patchDraft({ streaming: false, toolsUsed });
          const finalText = get().messages.find((m) => m.id === draft.id)?.content ?? "";
          if (get().ttsEnabled && finalText) speak(speakable(finalText));
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

    set({ streaming: false });
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
    const [tasks, memories, activity, proposals] = await Promise.all([
      getJSON<{ tasks: Task[] }>("/api/tasks"),
      getJSON<{ memories: Memory[] }>("/api/memories"),
      getJSON<{ activity: ActivityEvent[] }>("/api/activity"),
      getJSON<{ proposals: SkillProposal[] }>("/api/selfdev/proposals"),
    ]);
    set({
      tasks: tasks.tasks,
      memories: memories.memories,
      activity: activity.activity,
      proposals: proposals.proposals,
    });
  },

  bootstrap: async () => {
    try {
      const health = await getJSON<{ apiKeyConfigured: boolean }>("/api/health");
      set({ apiKeyConfigured: health.apiKeyConfigured });
      const msgs = await getJSON<{ messages: UIMessage[] }>("/api/messages");
      set({ messages: msgs.messages });
      await Promise.all([get().refreshGraph(), get().refreshPanels()]);
    } catch {
      set({ apiKeyConfigured: false });
    }
  },
}));
