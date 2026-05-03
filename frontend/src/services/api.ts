import type {
  Session,
  Image,
  GenerateRequest,
  GenerateCompleted,
  SettingsResponse,
  InpaintRequest,
  InpaintCompleted,
  LLMChatSession,
  LLMMessage,
  LLMSettings,
  LLMSettingsUpdate,
  LLMChatRequest,
} from "../types";

// --- Base URL 管理 ---

let cachedBaseUrl: string | null = null;
export const isTauri = "__TAURI_INTERNALS__" in window;

/**
 * 初始化后端 base URL。
 * Tauri 模式：invoke("backend_url") 获取完整 URL。
 * Web 模式：返回空字符串（走 Vite proxy 相对路径）。
 * 必须在任何 API 调用之前调用。
 */
export async function initBaseUrl(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    cachedBaseUrl = await invoke<string>("backend_url");
  } else {
    cachedBaseUrl = "";
  }
}

function getBaseUrl(): string {
  if (cachedBaseUrl === null) {
    throw new Error("initBaseUrl() must be called before using API");
  }
  return cachedBaseUrl;
}

// --- HTTP helpers ---

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// --- Sessions ---

export async function listSessions(): Promise<Session[]> {
  return request("/api/sessions");
}

export async function createSession(name: string): Promise<Session> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getSession(id: string): Promise<Session> {
  return request(`/api/sessions/${id}`);
}

export async function renameSession(
  id: string,
  name: string
): Promise<Session> {
  return request(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await request(`/api/sessions/${id}`, { method: "DELETE" });
}

// --- Images ---

export async function getSessionImages(sessionId: string): Promise<Image[]> {
  return request(`/api/sessions/${sessionId}/images`);
}

export async function getImage(id: string): Promise<Image> {
  return request(`/api/images/${id}`);
}

export function getImageFileUrl(id: string): string {
  return `${getBaseUrl()}/api/images/${id}/file`;
}

export async function deleteImage(id: string): Promise<void> {
  await request(`/api/images/${id}`, { method: "DELETE" });
}

export async function deleteImages(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteImage(id)));
}

// --- SSE helpers ---

// Vite 在编译时注入后端端口，用于 SSE 直连（绕过 proxy 缓冲）
declare const __BACKEND_PORT__: number;

/** SSE 连接直连后端（绕过 Vite proxy 的 body 缓冲） */
function getSSEBaseUrl(): string {
  if (isTauri) return getBaseUrl();
  return `http://127.0.0.1:${__BACKEND_PORT__}`;
}

type SSEEventHandler = (event: string, data: unknown) => void;

function connectSSE(url: string, body: unknown, handler: SSEEventHandler): AbortController {
  const controller = new AbortController();

  // SSE 请求直连后端，避免 Vite proxy 缓冲整个响应
  const sseBase = getSSEBaseUrl();
  const fullUrl = url.startsWith("/") ? `${sseBase}${url}` : url;

  fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        handler("error", { code: String(res.status), message: err.detail || res.statusText });
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              handler(currentEvent, JSON.parse(line.slice(6)));
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        handler("network_error", { code: "network_error", message: err.message });
      }
    });

  return controller;
}

// --- Generate (SSE) ---

export function generateImage(
  req: GenerateRequest,
  onPartial: (index: number, b64: string) => void,
  onCompleted: (data: GenerateCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  return connectSSE(`${getBaseUrl()}/api/generate`, req, (event, data) => {
    if (event === "partial_image") onPartial((data as { index: number; b64_json: string }).index, (data as { index: number; b64_json: string }).b64_json);
    else if (event === "completed") onCompleted(data as GenerateCompleted);
    else if (event === "error") onError((data as { code: string; message: string }).code, (data as { code: string; message: string }).message);
    else if (event === "network_error") onError((data as { code: string; message: string }).code, (data as { code: string; message: string }).message);
  });
}

// --- Inpaint (SSE) ---

export function inpaintImage(
  req: InpaintRequest,
  onCompleted: (data: InpaintCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  return connectSSE(`${getBaseUrl()}/api/inpaint`, req, (event, data) => {
    if (event === "completed") onCompleted(data as InpaintCompleted);
    else if (event === "error" || event === "network_error") onError((data as { code: string; message: string }).code, (data as { code: string; message: string }).message);
  });
}

// --- Settings ---

export async function getSettings(): Promise<SettingsResponse> {
  return request("/api/settings");
}

export async function updateSettings(
  settings: Record<string, string>
): Promise<void> {
  await request("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

// ── LLM AI 助手 API ──

export async function getLLMSettings(): Promise<LLMSettings> {
  return request<LLMSettings>("/api/llm-settings");
}

export async function updateLLMSettings(data: LLMSettingsUpdate): Promise<LLMSettings> {
  return request<LLMSettings>("/api/llm-settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function listLLMChatSessions(sessionId: string): Promise<LLMChatSession[]> {
  return request<LLMChatSession[]>(`/api/sessions/${sessionId}/llm-chats`);
}

export async function createLLMChatSession(sessionId: string, name?: string): Promise<LLMChatSession> {
  return request<LLMChatSession>(`/api/sessions/${sessionId}/llm-chats`, {
    method: "POST",
    body: JSON.stringify({ name: name || "新对话" }),
  });
}

export async function renameLLMChatSession(chatId: string, name: string): Promise<LLMChatSession> {
  return request<LLMChatSession>(`/api/llm-chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteLLMChatSession(chatId: string): Promise<void> {
  await request(`/api/llm-chats/${chatId}`, { method: "DELETE" });
}

export async function listLLMMessages(chatId: string): Promise<LLMMessage[]> {
  return request<LLMMessage[]>(`/api/llm-chats/${chatId}/messages`);
}

export async function editLLMMessage(messageId: string, content: string): Promise<void> {
  await request(`/api/llm-messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteLLMMessage(messageId: string): Promise<void> {
  await request(`/api/llm-messages/${messageId}`, { method: "DELETE" });
}

export async function batchDeleteLLMMessages(messageIds: string[]): Promise<void> {
  await request("/api/llm-messages/batch-delete", {
    method: "POST",
    body: JSON.stringify({ message_ids: messageIds }),
  });
}

export async function undoDeleteLLMMessage(messageId: string): Promise<void> {
  await request(`/api/llm-messages/${messageId}/undo-delete`, { method: "POST" });
}

// SSE 聊天事件 handler 类型
export interface LLMChatEventHandler {
  onToken: (text: string) => void;
  onThinking: (text: string) => void;
  onBuffering: (data: { status: string; elapsed_ms: number }) => void;
  onAiBlock: (data: Record<string, unknown>) => void;
  onParseWarning: (data: { status: string; raw_text: string }) => void;
  onUsage: (data: { prompt_tokens: number; completion_tokens: number }) => void;
  onCompleted: (data: {
    message_id: string;
    token_count: number;
    session_name?: string;
    thinking_content?: string;
    thinking_duration_ms?: number;
  }) => void;
  onError: (data: { code: string; message: string }) => void;
}

export function sendLLMChat(
  chatId: string,
  body: LLMChatRequest,
  handler: LLMChatEventHandler,
): AbortController {
  const url = `${getBaseUrl()}/api/llm-chats/${chatId}/chat`;
  return connectSSE(url, body, (event, rawData) => {
    const data = rawData as Record<string, unknown>;
    switch (event) {
      case "thinking": handler.onThinking((data.text as string) || ""); break;
      case "token": handler.onToken((data.text as string) || ""); break;
      case "buffering": handler.onBuffering(data as { status: string; elapsed_ms: number }); break;
      case "ai_block": handler.onAiBlock(data); break;
      case "parse_warning": handler.onParseWarning(data as { status: string; raw_text: string }); break;
      case "usage": handler.onUsage(data as { prompt_tokens: number; completion_tokens: number }); break;
      case "completed": handler.onCompleted(data as { message_id: string; token_count: number; session_name?: string }); break;
      case "error":
      case "network_error": handler.onError(data as { code: string; message: string }); break;
    }
  });
}
