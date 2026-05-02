import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message: string, duration = 3000) => {
    const id = String(Date.now());
    set({ toasts: [{ id, message }] });
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  dismissToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
