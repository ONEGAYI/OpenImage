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

interface GenerationState {
  isGenerating: boolean;
  partialImage: string | null;
  error: string | null;
  attachments: AttachedFile[];
  abortController: AbortController | null;

  addAttachment: (file: AttachedFile) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  startGeneration: (
    sessionId: string,
    prompt: string,
    forkFrom?: string,
    onSuccess?: () => void
  ) => void;
  cancelGeneration: () => void;
  clearError: () => void;
  pendingForkFrom: string | null;
  setPendingForkFrom: (id: string | null) => void;
  aspectRatio: string;
  imageSize: string;
  setAspectRatio: (ratio: string) => void;
  setImageSize: (size: string) => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  isGenerating: false,
  partialImage: null,
  error: null,
  attachments: [],
  abortController: null,
  pendingForkFrom: null,
  aspectRatio: "1:1",
  imageSize: "1K",

  addAttachment: (file) =>
    set((state) => ({ attachments: [...state.attachments, file] })),

  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ attachments: [] }),

  startGeneration: (sessionId, prompt, forkFrom, onSuccess) => {
    const { attachments, aspectRatio, imageSize } = get();
    set({ isGenerating: true, partialImage: null, error: null });

    const images = attachments.map((a) => ({
      type: "base64" as const,
      data: a.data,
      media_type: a.media_type,
    }));

    const controller = generateImage(
      {
        session_id: sessionId,
        prompt,
        images,
        fork_from: forkFrom,
        params: { size: SIZE_MAP[aspectRatio]?.[imageSize] || "1024x1024" },
      },
      (_index, b64) => {
        set({ partialImage: `data:image/png;base64,${b64}` });
      },
      (_data: GenerateCompleted) => {
        set({
          isGenerating: false,
          partialImage: null,
        });
        onSuccess?.();
        import("./sessionStore").then(({ useSessionStore }) => {
          const store = useSessionStore.getState();
          Promise.all([store.fetchSessions(), store.selectSession(sessionId)]);
        });
      },
      (code, message) => {
        set({ isGenerating: false, error: `${code}: ${message}` });
      }
    );

    set({ abortController: controller });
  },

  cancelGeneration: () => {
    get().abortController?.abort();
    set({ isGenerating: false, partialImage: null, abortController: null });
  },

  clearError: () => set({ error: null }),

  setPendingForkFrom: (id) => set({ pendingForkFrom: id }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setImageSize: (size) => set({ imageSize: size }),
}));
