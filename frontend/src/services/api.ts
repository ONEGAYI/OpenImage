import type {
  Session,
  Image,
  GenerateRequest,
  GenerateCompleted,
  SettingsResponse,
  InpaintRequest,
  InpaintCompleted,
} from "../types";

export const BASE_URL = import.meta.env.DEV 
  ? "http://localhost:8765"
  : "http://127.0.0.1:8765";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
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
  return `${BASE_URL}/api/images/${id}/file`;
}

export async function deleteImage(id: string): Promise<void> {
  await request(`/api/images/${id}`, { method: "DELETE" });
}

export async function deleteImages(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteImage(id)));
}

// --- Generate (SSE) ---

export function generateImage(
  req: GenerateRequest,
  onPartial: (index: number, b64: string) => void,
  onCompleted: (data: GenerateCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
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
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "partial_image") {
                onPartial(data.index, data.b64_json);
              } else if (currentEvent === "completed") {
                onCompleted(data);
              } else if (currentEvent === "error") {
                onError(data.code, data.message);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError("network_error", err.message);
      }
    });

  return controller;
}

// --- Inpaint (SSE) ---

export function inpaintImage(
  req: InpaintRequest,
  onCompleted: (data: InpaintCompleted) => void,
  onError: (code: string, message: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/inpaint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
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
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "completed") {
                onCompleted(data);
              } else if (currentEvent === "error") {
                onError(data.code, data.message);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError("network_error", err.message);
      }
    });

  return controller;
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
