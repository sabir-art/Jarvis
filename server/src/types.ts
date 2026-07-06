/** Types partagés du domaine JARVIS. */

export type NodeType =
  | "hub"
  | "memory"
  | "note"
  | "task"
  | "conversation"
  | "search"
  | "document"
  | "skill"
  | "system"
  | "proposal"
  | "wiki";

export interface BrainNode {
  id: string;
  type: NodeType;
  label: string;
  content: string;
  tags: string[];
  /** id du hub (cluster) auquel le nœud est rattaché */
  cluster: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  kind: "cluster" | "semantic" | "reference";
  weight: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  model?: string;
  modelReason?: string;
  toolsUsed?: string[];
}

export interface Memory {
  id: string;
  content: string;
  category: string;
  createdAt: string;
  nodeId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  nodeId?: string;
}

export interface Task {
  id: string;
  title: string;
  due?: string;
  done: boolean;
  createdAt: string;
  nodeId?: string;
}

export interface JarvisDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  nodeId?: string;
}

export type ProposalStatus = "pending" | "approved" | "rejected";

/** Proposition d'auto-amélioration : un nouvel outil écrit par JARVIS, soumis à validation humaine. */
export interface SkillProposal {
  id: string;
  name: string;
  description: string;
  /** Corps JavaScript d'une fonction async (input) => string */
  code: string;
  inputSchema: Record<string, unknown>;
  rationale: string;
  status: ProposalStatus;
  createdAt: string;
  reviewedAt?: string;
  nodeId?: string;
}

/**
 * Page du wiki (pattern « LLM Wiki » de Karpathy) : une synthèse markdown
 * rédigée et entretenue par JARVIS, mise à jour à chaque ingestion de source.
 */
export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  /** intitulés des sources intégrées à cette page */
  sources: string[];
  createdAt: string;
  updatedAt: string;
  nodeId?: string;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
}

export interface Database {
  nodes: BrainNode[];
  edges: BrainEdge[];
  messages: ChatMessage[];
  memories: Memory[];
  notes: Note[];
  tasks: Task[];
  documents: JarvisDocument[];
  proposals: SkillProposal[];
  activity: ActivityEvent[];
  wikiPages: WikiPage[];
}
