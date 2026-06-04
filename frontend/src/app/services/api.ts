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
  // F-C1 (login): 不把後端原始錯誤訊息曝光給 UI
  if (!res.ok) {
    throw new Error("LOGIN_FAILED");
  }
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
  onError: (err: string) => void,
  onToolUse?: (tools: string[]) => void,
  fileContext?: string,          // 新增：文件解析後的純文字
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/messages/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ conversation_id: conversationId, content, images, model, file_context: fileContext }),
        signal: controller.signal,
      });

      // F-C1: 先檢查 HTTP 狀態，防止把錯誤頁當 SSE 解析
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        onError(`伺服器錯誤 (HTTP ${res.status})`);
        return;
      }
      if (!res.body) {
        onError("No response body");
        return;
      }

      const reader = res.body.getReader();
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
            else if (parsed.tool_use) onToolUse?.(parsed.tool_use);
            else if (parsed.content) onChunk(parsed.content);
          } catch (e) {
            // F-S: 開發模式下輸出 parse 警告
            if (import.meta.env.DEV) console.warn("SSE parse error:", e, data);
          }
        }
      }
      onDone();
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") onError(String(e));
    }
  })();

  return controller;
}

export function streamRegenerate(
  conversationId: string,
  messageId: string,
  model: string,
  onChunk: (text: string) => void,
  onUserMessage: (msg: Message) => void,
  onAssistantMessage: (msg: Message) => void,
  onDone: () => void,
  onError: (err: string) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/messages/regenerate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ conversation_id: conversationId, message_id: messageId, model }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        onError(`伺服器錯誤 (HTTP ${res.status})`);
        return;
      }
      if (!res.body) { onError("No response body"); return; }

      const reader = res.body.getReader();
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
          } catch (e) {
            if (import.meta.env.DEV) console.warn("SSE parse error:", e, data);
          }
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

// --- File Upload ---
export interface UploadResult {
  filename: string;
  char_count: number;
  preview: string;
  full_text: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Image Upload（Gemini Vision → 文字描述）---
export interface ImageUploadResult {
  filename: string;
  content_type: string;
  description_length: number;
  preview: string;
  full_text: string;  // "[圖片內容描述]\n..." 格式，直接當 file_context 用
}

export async function uploadImage(file: File): Promise<ImageUploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Conversation rename ---
export async function renameConversation(id: string, title: string): Promise<void> {
  const token = localStorage.getItem("token") ?? "";
  await fetch(`${BASE_URL}/conversations/${id}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  });
}

export async function updateSystemPrompt(id: string, system_prompt: string): Promise<void> {
  const token = localStorage.getItem("token") ?? "";
  await fetch(`${BASE_URL}/conversations/${id}/system-prompt`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ system_prompt }),
  });
}

// --- Image Generation（Gemini 3.1 Flash Image）---
export interface GenerateImageResult {
  success: boolean;
  image_url: string;   // data:image/jpeg;base64,...
  prompt: string;
}

export async function generateImage(prompt: string, conversationId?: string): Promise<GenerateImageResult> {
  return req<GenerateImageResult>("/generate-image", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prompt, conversation_id: conversationId ?? null }),
  });
}

// --- Search ---
export interface SearchResult {
  message_id: string;
  conversation_id: string;
  conversation_title: string;
  role: "user" | "assistant";
  snippet: string;   // 含 **keyword** 高亮標記
  created_at: string;
}

export interface SearchParams {
  q: string;
  scope?: "all" | "user" | "assistant";
  date?: "all" | "today" | "week" | "month";
  limit?: number;
}

export async function searchMessages(params: SearchParams): Promise<SearchResult[]> {
  const qs = new URLSearchParams({ q: params.q });
  if (params.scope && params.scope !== "all") qs.set("scope", params.scope);
  if (params.date  && params.date  !== "all") qs.set("date",  params.date);
  if (params.limit) qs.set("limit", String(params.limit));
  return req<SearchResult[]>(`/search?${qs}`, { headers: headers() });
}

// --- PPTX Export ---
export async function exportPptx(prompt: string, slideCount: number = 5): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/export/pptx`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prompt, slide_count: slideCount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.blob();
}
