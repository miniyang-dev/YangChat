import type { Conversation, ConversationDetail, Message, ModelInfo } from "../types";

const BASE_URL = "/api";

function getToken(): string {
  return localStorage.getItem("token") || "";
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
    ...extra,
  };
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// --- Auth ---
export async function login(username: string, password: string) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

// --- Conversations ---
export async function listConversations(): Promise<Conversation[]> {
  return req<Conversation[]>("/conversations", { headers: headers() });
}

export async function createConversation(
  model: string,
  firstMessage: string
): Promise<ConversationDetail> {
  return req<ConversationDetail>("/conversations", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model, first_message: firstMessage }),
  });
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return req<ConversationDetail>(`/conversations/${id}`, { headers: headers() });
}

export async function deleteConversation(id: string): Promise<void> {
  await req(`/conversations/${id}`, { method: "DELETE", headers: headers() });
}

// --- Messages ---
export interface SendResult {
  success: boolean;
  user_message?: Message;
  assistant_message?: Message;
  error?: string;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  images?: string[],
  model?: string
): Promise<SendResult> {
  return req<SendResult>("/messages/send", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ conversation_id: conversationId, content, images, model }),
  });
}

export function streamMessage(
  conversationId: string,
  content: string,
  images: string[] | undefined,
  model: string | undefined,
  onChunk: (text: string) => void,
  onUserMessage: (msg: Message) => void,
  onAssistantMessage: (msg: Message) => void,
  onDone: () => void,
  onError: (err: string) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/messages/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ conversation_id: conversationId, content, images, model }),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") { onDone(); return; }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "user_message") onUserMessage(parsed.message);
            else if (parsed.type === "assistant_message") onAssistantMessage(parsed.message);
            else if (parsed.type === "error") onError(parsed.error);
            else if (parsed.content) onChunk(parsed.content);
          } catch {}
        }
      }
      onDone();
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") onError(String(e));
    }
  })();

  return controller;
}

// --- Models ---
export async function listModels(): Promise<ModelInfo[]> {
  const res = await req<{ success: boolean; data: ModelInfo[] }>("/models", {
    headers: headers(),
  });
  return res.data;
}
