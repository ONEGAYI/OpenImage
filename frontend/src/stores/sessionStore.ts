import { create } from "zustand";
import type { Session, Image } from "../types";
import * as api from "../services/api";

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  images: Image[];
  selectedImageIds: string[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  fetchSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createSession: (name: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  selectImage: (id: string | null) => void;
  toggleImageSelect: (id: string) => void;
  clearSelection: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  images: [],
  selectedImageIds: [],
  loading: false,
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  fetchSessions: async () => {
    const sessions = await api.listSessions();
    set({ sessions });
  },

  selectSession: async (id: string) => {
    if (get().loading) return;
    set({ loading: true, activeSessionId: id, selectedImageIds: [] });
    try {
      const images = await api.getSessionImages(id);
      set({ images, loading: false });
    } catch {
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
      selectedImageIds:
        state.activeSessionId === id ? [] : state.selectedImageIds,
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
    set({ selectedImageIds: id ? [id] : [] });
  },

  toggleImageSelect: (id: string) => {
    set((state) => {
      const sel = state.selectedImageIds;
      return {
        selectedImageIds: sel.includes(id)
          ? sel.filter((x) => x !== id)
          : [...sel, id],
      };
    });
  },

  clearSelection: () => {
    set({ selectedImageIds: [] });
  },
}));
