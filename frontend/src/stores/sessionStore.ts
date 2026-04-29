import { create } from "zustand";
import type { Session, Image } from "../types";
import * as api from "../services/api";

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  images: Image[];
  selectedImageId: string | null;
  loading: boolean;

  fetchSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createSession: (name: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  selectImage: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  images: [],
  selectedImageId: null,
  loading: false,

  fetchSessions: async () => {
    const sessions = await api.listSessions();
    set({ sessions });
  },

  selectSession: async (id: string) => {
    set({ loading: true, activeSessionId: id, selectedImageId: null });
    try {
      const images = await api.getSessionImages(id);
      set({ images });
    } finally {
      set({ loading: false });
    }
  },

  createSession: async (name: string) => {
    const session = await api.createSession(name);
    set((state) => ({ sessions: [session, ...state.sessions] }));
    await get().selectSession(session.id);
  },

  deleteSession: async (id: string) => {
    await api.deleteSession(id);
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId:
        state.activeSessionId === id ? null : state.activeSessionId,
      images: state.activeSessionId === id ? [] : state.images,
      selectedImageId:
        state.activeSessionId === id ? null : state.selectedImageId,
    }));
  },

  renameSession: async (id: string, name: string) => {
    await api.renameSession(id, name);
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name } : s
      ),
    }));
  },

  selectImage: (id: string | null) => {
    set({ selectedImageId: id });
  },
}));
