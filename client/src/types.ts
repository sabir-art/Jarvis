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
  | "proposal";

export interface BrainNode {
  id: string;
  type: NodeType;
  label: string;
  content: string;
  tags: string[];
  cluster: string;
  createdAt: string;
}

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  kind: "cluster" | "semantic" | "reference";
  weight: number;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  modelReason?: string;
  toolsUsed?: string[];
  streaming?: boolean;
}

export interface Task {
  id: string;
  title: string;
  due?: string;
  done: boolean;
  createdAt: string;
}

export interface Memory {
  id: string;
  content: string;
  category: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
}

export interface SkillProposal {
  id: string;
  name: string;
  description: string;
  code: string;
  rationale: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface ToolActivity {
  name: string;
  status: "running" | "ok" | "error";
}

export type ModelChoice = "auto" | "fast" | "balanced" | "deep";
