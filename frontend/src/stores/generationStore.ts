import { create } from "zustand";
import type { AttachedFile, GenerateCompleted } from "../types";
import { generateImage } from "../services/api";

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
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  isGenerating: false,
  partialImage: null,
  error: null,
  attachments: [],
  abortController: null,
  pendingForkFrom: null,

  addAttachment: (file) =>
    set((state) => ({ attachments: [...state.attachments, file] })),

  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ attachments: [] }),

  startGeneration: (sessionId, prompt, forkFrom, onSuccess) => {
    const { attachments } = get();
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
          useSessionStore.getState().selectSession(sessionId);
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
}));
