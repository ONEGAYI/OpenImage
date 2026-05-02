import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
}

interface ToastState {
  toast: Toast | null;
  showToast: (message: string, duration?: number) => void;
  dismissToast: () => void;
}

const timerMap = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set) => ({
  toast: null,

  showToast: (message: string, duration = 3000) => {
    const id = crypto.randomUUID();
    set((state) => {
      if (state.toast) {
        const prev = timerMap.get(state.toast.id);
        if (prev) clearTimeout(prev);
        timerMap.delete(state.toast.id);
      }
      return { toast: { id, message } };
    });
    timerMap.set(id, setTimeout(() => {
      timerMap.delete(id);
      set((state) => (state.toast?.id === id ? { toast: null } : state));
    }, duration));
  },

  dismissToast: () => {
    set((state) => {
      if (state.toast) {
        const timer = timerMap.get(state.toast.id);
        if (timer) clearTimeout(timer);
        timerMap.delete(state.toast.id);
      }
      return { toast: null };
    });
  },
}));
