import { create } from "zustand";
import { LLMChatSession, LLMMessage, AiBlock } from "../types";
import * as api from "../services/api";

interface LLMChatState {
  // 全局状态
  aiEnabled: boolean;
  currentChatSessionId: string | null;

  // 数据
  chatSessions: LLMChatSession[];
  messages: LLMMessage[];

  // 流式状态
  streamingText: string;
  bufferingState: "idle" | "streaming" | "buffering" | "ready";
  bufferElapsed: number;
  currentAiBlock: AiBlock | null;
  abortController: AbortController | null;

  // token
  totalTokens: number;

  // UI 状态
  panelExpanded: boolean;

  // Actions
  toggleAI: () => void;
  setPanelExpanded: (expanded: boolean) => void;
  loadChatSessions: (sessionId: string) => Promise<void>;
  createChatSession: (sessionId: string) => Promise<void>;
  selectChatSession: (chatId: string) => Promise<void>;
  renameChatSession: (chatId: string, name: string) => Promise<void>;
  deleteChatSession: (chatId: string, sessionId: string) => Promise<void>;
  sendMessage: (
    content: string,
    attachments?: Array<{ data: string; media_type: string }>,
    formResponse?: Record<string, string>,
  ) => void;
  cancelStream: () => void;
  resetStreamState: () => void;
}

export const useLLMChatStore = create<LLMChatState>((set, get) => ({
  aiEnabled: false,
  currentChatSessionId: null,
  chatSessions: [],
  messages: [],
  streamingText: "",
  bufferingState: "idle",
  bufferElapsed: 0,
  currentAiBlock: null,
  abortController: null,
  totalTokens: 0,
  panelExpanded: false,

  toggleAI: () => {
    set((s) => ({ aiEnabled: !s.aiEnabled }));
  },

  setPanelExpanded: (expanded) => set({ panelExpanded: expanded }),

  loadChatSessions: async (sessionId: string) => {
    const sessions = await api.listLLMChatSessions(sessionId);
    set({ chatSessions: sessions });
    if (sessions.length > 0 && !get().currentChatSessionId) {
      get().selectChatSession(sessions[0].id);
    }
  },

  createChatSession: async (sessionId: string) => {
    const session = await api.createLLMChatSession(sessionId);
    set((s) => ({
      chatSessions: [session, ...s.chatSessions],
      currentChatSessionId: session.id,
      messages: [],
      totalTokens: 0,
    }));
  },

  selectChatSession: async (chatId: string) => {
    const messages = await api.listLLMMessages(chatId);
    const session = get().chatSessions.find((s) => s.id === chatId);
    set({
      currentChatSessionId: chatId,
      messages,
      totalTokens: session?.total_tokens || 0,
    });
  },

  renameChatSession: async (chatId: string, name: string) => {
    await api.renameLLMChatSession(chatId, name);
    set((s) => ({
      chatSessions: s.chatSessions.map((cs) =>
        cs.id === chatId ? { ...cs, name } : cs,
      ),
    }));
  },

  deleteChatSession: async (chatId: string, sessionId: string) => {
    await api.deleteLLMChatSession(chatId);
    await get().loadChatSessions(sessionId);
    if (get().currentChatSessionId === chatId) {
      set({ currentChatSessionId: null, messages: [], totalTokens: 0 });
    }
  },

  sendMessage: (content, attachments, formResponse) => {
    const { currentChatSessionId } = get();
    if (!currentChatSessionId) return;

    set({
      streamingText: "",
      bufferingState: "streaming",
      currentAiBlock: null,
    });

    const tempUserMsg: LLMMessage = {
      id: `temp_${Date.now()}`,
      chat_session_id: currentChatSessionId,
      role: "user",
      content,
      ai_block: null,
      token_count: 0,
      attachments: attachments ? JSON.stringify(attachments) : null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    const controller = api.sendLLMChat(
      currentChatSessionId,
      { content, attachments, form_response: formResponse },
      {
        onToken: (text) => {
          set((s) => ({ streamingText: s.streamingText + text }));
        },
        onBuffering: (data) => {
          set({
            bufferingState: "buffering",
            bufferElapsed: data.elapsed_ms,
          });
        },
        onAiBlock: (data) => {
          const block = data as unknown as AiBlock;
          set({ currentAiBlock: block, bufferingState: "ready" });
        },
        onParseWarning: () => {
          set({ bufferingState: "idle" });
        },
        onUsage: (data) => {
          set((s) => ({
            totalTokens:
              s.totalTokens + data.prompt_tokens + data.completion_tokens,
          }));
        },
        onCompleted: () => {
          const chatId = get().currentChatSessionId;
          if (chatId) {
            api.listLLMMessages(chatId).then((msgs) => set({ messages: msgs }));
          }
          set({
            streamingText: "",
            bufferingState: "idle",
            abortController: null,
          });
        },
        onError: (data) => {
          const errMsg: LLMMessage = {
            id: `err_${Date.now()}`,
            chat_session_id: currentChatSessionId!,
            role: "system",
            content: `错误：${data.message}`,
            ai_block: null,
            token_count: 0,
            attachments: null,
            created_at: new Date().toISOString(),
            deleted_at: null,
          };
          set((s) => ({
            messages: [...s.messages, errMsg],
            streamingText: "",
            bufferingState: "idle",
            abortController: null,
          }));
        },
      },
    );

    set({ abortController: controller });
  },

  cancelStream: () => {
    get().abortController?.abort();
    set({ streamingText: "", bufferingState: "idle", abortController: null });
  },

  resetStreamState: () => {
    set({
      streamingText: "",
      bufferingState: "idle",
      currentAiBlock: null,
      bufferElapsed: 0,
    });
  },
}));
