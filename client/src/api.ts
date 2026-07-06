import type { BrainNode } from "./types";

/** Événements SSE émis par POST /api/chat. */
export interface ChatStreamHandlers {
  onMeta?: (meta: { model: string; tier: string; reason: string }) => void;
  onText?: (delta: string) => void;
  onToolStart?: (name: string) => void;
  onToolResult?: (name: string, result: string, isError: boolean) => void;
  onNodeAdded?: (node: BrainNode) => void;
  onDone?: (messageId: string, toolsUsed: string[]) => void;
  onError?: (message: string) => void;
}

export async function streamChat(
  body: { message: string; modelOverride?: string; images?: { media_type: string; data: string }[] },
  handlers: ChatStreamHandlers,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    handlers.onError?.(`Le serveur a répondu ${res.status}.`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (raw: string) => {
    const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) return;
    let event: any;
    try {
      event = JSON.parse(dataLine.slice(5));
    } catch {
      return;
    }
    switch (event.type) {
      case "meta":
        handlers.onMeta?.(event);
        break;
      case "text":
        handlers.onText?.(event.delta);
        break;
      case "tool_start":
        handlers.onToolStart?.(event.name);
        break;
      case "tool_result":
        handlers.onToolResult?.(event.name, event.result, event.isError);
        break;
      case "node_added":
        handlers.onNodeAdded?.(event.node);
        break;
      case "done":
        handlers.onDone?.(event.messageId, event.toolsUsed ?? []);
        break;
      case "error":
        handlers.onError?.(event.message);
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (chunk.trim()) dispatch(chunk);
    }
  }
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}
