import { create } from "zustand";
import type { AttachedFile, GenerateCompleted } from "../types";
import { generateImage } from "../services/api";

export const SIZE_MAP: Record<string, Record<string, string>> = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  "16:9": { "1K": "1536x1024", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "1024x1536", "2K": "1152x2048", "4K": "2160x3840" },
};

export const RATIO_OPTIONS = ["1:1", "16:9", "9:16"] as const;
export const SIZE_OPTIONS = ["1K", "2K", "4K"] as const;
export const QUALITY_OPTIONS = ["auto", "low", "medium", "high"] as const;
export const MODERATION_OPTIONS = ["auto", "low"] as const;

interface SessionGenState {
  isGenerating: boolean;
  partialImage: string | null;
  abortController: AbortController | null;
}

interface GenerationState {
  sessionGenerations: Record<string, SessionGenState>;
  error: string | null;
  attachments: AttachedFile[];
  pendingForkFrom: string | null;
  aspectRatio: (typeof RATIO_OPTIONS)[number];
  imageSize: (typeof SIZE_OPTIONS)[number];
  quality: (typeof QUALITY_OPTIONS)[number];
  moderation: (typeof MODERATION_OPTIONS)[number];

  addAttachment: (file: AttachedFile) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  startGeneration: (
    sessionId: string,
    prompt: string,
    forkFrom?: string,
    onSuccess?: () => void
  ) => void;
  cancelGeneration: (sessionId: string) => void;
  clearError: () => void;
  setPendingForkFrom: (id: string | null) => void;
  setAspectRatio: (ratio: (typeof RATIO_OPTIONS)[number]) => void;
  setImageSize: (size: (typeof SIZE_OPTIONS)[number]) => void;
  setQuality: (quality: (typeof QUALITY_OPTIONS)[number]) => void;
  setModeration: (moderation: (typeof MODERATION_OPTIONS)[number]) => void;
}

const defaultGen: SessionGenState = {
  isGenerating: false,
  partialImage: null,
  abortController: null,
};

const GEN_RESET: Partial<SessionGenState> = {
  isGenerating: false,
  partialImage: null,
  abortController: null,
};

function updateSessionGen(
  state: GenerationState,
  sessionId: string,
  patch: Partial<SessionGenState>
): Record<string, SessionGenState> {
  return {
    ...state.sessionGenerations,
    [sessionId]: { ...state.sessionGenerations[sessionId] ?? defaultGen, ...patch },
  };
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  sessionGenerations: {},
  error: null,
  attachments: [],
  pendingForkFrom: null,
  aspectRatio: "1:1",
  imageSize: "1K",
  quality: "auto" as (typeof QUALITY_OPTIONS)[number],
  moderation: "auto" as (typeof MODERATION_OPTIONS)[number],

  addAttachment: (file) =>
    set((state) => ({ attachments: [...state.attachments, file] })),

  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ attachments: [] }),

  startGeneration: (sessionId, prompt, forkFrom, onSuccess) => {
    const { attachments, aspectRatio, imageSize, quality, moderation, sessionGenerations } = get();
    if (sessionGenerations[sessionId]?.isGenerating) return;

    const images = attachments.map((a) => ({
      type: "base64" as const,
      data: a.data,
      media_type: a.media_type,
    }));

    const params: Record<string, string> = {
      size: SIZE_MAP[aspectRatio]?.[imageSize] || "1024x1024",
      quality,
      moderation,
    };

    const controller = generateImage(
      {
        session_id: sessionId,
        prompt,
        images,
        fork_from: forkFrom,
        params,
      },
      (_index, b64) => {
        set((state) => ({
          sessionGenerations: updateSessionGen(state, sessionId, {
            partialImage: `data:image/png;base64,${b64}`,
          }),
        }));
      },
      (_data: GenerateCompleted) => {
        set((state) => ({
          sessionGenerations: updateSessionGen(state, sessionId, GEN_RESET),
        }));
        onSuccess?.();
        import("./sessionStore").then(({ useSessionStore }) => {
          const store = useSessionStore.getState();
          Promise.all([store.fetchSessions(), store.selectSession(sessionId)]);
        });
      },
      (code, message) => {
        set((state) => ({
          sessionGenerations: updateSessionGen(state, sessionId, GEN_RESET),
          error: `${code}: ${message}`,
        }));
      }
    );

    set((state) => ({
      sessionGenerations: updateSessionGen(state, sessionId, {
        isGenerating: true,
        partialImage: null,
        abortController: controller,
      }),
      error: null,
    }));
  },

  cancelGeneration: (sessionId) => {
    const gen = get().sessionGenerations[sessionId];
    gen?.abortController?.abort();
    set((state) => ({
      sessionGenerations: updateSessionGen(state, sessionId, GEN_RESET),
    }));
  },

  clearError: () => set({ error: null }),

  setPendingForkFrom: (id) => set({ pendingForkFrom: id }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setImageSize: (size) => set({ imageSize: size }),
  setQuality: (q) => set({ quality: q }),
  setModeration: (m) => set({ moderation: m }),
}));
