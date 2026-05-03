import { create } from "zustand";
import { LLMChatSession, LLMMessage, AiBlock } from "../types";
import * as api from "../services/api";
import { useGenerationStore, SIZE_MAP } from "./generationStore";

interface LLMChatState {
  // 全局状态
  aiEnabled: boolean;
  currentChatSessionId: string | null;

  // 数据
  chatSessions: LLMChatSession[];
  messages: LLMMessage[];

  // 流式状态
  streamingText: string;
  streamingThinking: string;
  bufferingState: "idle" | "streaming" | "buffering" | "ready";
  bufferElapsed: number;
  currentAiBlock: AiBlock | null;
  abortController: AbortController | null;

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
  cancelStream: () => Promise<void>;
}

export const useLLMChatStore = create<LLMChatState>((set, get) => ({
  aiEnabled: false,
  currentChatSessionId: null,
  chatSessions: [],
  messages: [],
  streamingText: "",
  streamingThinking: "",
  bufferingState: "idle",
  bufferElapsed: 0,
  currentAiBlock: null,
  abortController: null,
  panelExpanded: false,

  toggleAI: () => {
    set((s) => ({ aiEnabled: !s.aiEnabled }));
  },

  setPanelExpanded: (expanded) => set({ panelExpanded: expanded }),

  loadChatSessions: async (sessionId: string) => {
    const sessions = await api.listLLMChatSessions(sessionId);
    // 切换图片会话时重置 LLM 聊天状态
    set({ chatSessions: sessions, currentChatSessionId: null, messages: [] });
    if (sessions.length > 0) {
      get().selectChatSession(sessions[0].id);
    }
  },

  createChatSession: async (sessionId: string) => {
    const session = await api.createLLMChatSession(sessionId);
    set((s) => ({
      chatSessions: [session, ...s.chatSessions],
      currentChatSessionId: session.id,
      messages: [],
    }));
  },

  selectChatSession: async (chatId: string) => {
    const messages = await api.listLLMMessages(chatId);
    set({
      currentChatSessionId: chatId,
      messages,
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
    const sessions = await api.listLLMChatSessions(sessionId);
    set((s) => ({
      chatSessions: sessions,
      ...(s.currentChatSessionId === chatId
        ? { currentChatSessionId: null, messages: [] }
        : {}),
    }));
  },

  sendMessage: (content, attachments, formResponse) => {
    const { currentChatSessionId } = get();
    if (!currentChatSessionId) return;

    // 从 generationStore 读取当前生成偏好
    const gen = useGenerationStore.getState();
    const context = {
      aspect_ratio: gen.aspectRatio,
      size_label: SIZE_MAP[gen.aspectRatio]?.[gen.imageSize] || undefined,
    };

    set({
      streamingText: "",
      streamingThinking: "",
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
      thinking_content: null,
      thinking_duration_ms: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    const controller = api.sendLLMChat(
      currentChatSessionId,
      { content, attachments, form_response: formResponse, context },
      {
        onToken: (text) => {
          set((s) => ({ streamingText: s.streamingText + text }));
        },
        onThinking: (text) => {
          set((s) => ({ streamingThinking: s.streamingThinking + text }));
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
          const add = data.prompt_tokens + data.completion_tokens;
          set((s) => ({
            chatSessions: s.chatSessions.map((cs) =>
              cs.id === s.currentChatSessionId
                ? { ...cs, total_tokens: cs.total_tokens + add }
                : cs,
            ),
          }));
        },
        onCompleted: (data) => {
          if (!data.message_id) return;
          const sessionName = data.session_name;
          const updateSession = (s: LLMChatState) => ({
            streamingText: "",
            streamingThinking: "",
            bufferingState: "idle" as const,
            currentAiBlock: null as AiBlock | null,
            abortController: null as AbortController | null,
            chatSessions: s.chatSessions.map((cs) =>
              cs.id === currentChatSessionId
                ? { ...cs,
                    ...(sessionName ? { name: sessionName } : {}),
                    total_tokens: data.total_tokens ?? cs.total_tokens,
                  }
                : cs
            ),
          });
          api.listLLMMessages(currentChatSessionId).then((freshMessages) => {
            set((s) => ({ ...updateSession(s), messages: freshMessages }));
          }).catch(() => {
            const aiMsg: LLMMessage = {
              id: data.message_id,
              chat_session_id: currentChatSessionId,
              role: "assistant",
              content: get().streamingText,
              ai_block: get().currentAiBlock ? JSON.stringify(get().currentAiBlock) : null,
              token_count: data.token_count,
              attachments: null,
              thinking_content: data.thinking_content || get().streamingThinking || null,
              thinking_duration_ms: data.thinking_duration_ms ?? null,
              created_at: new Date().toISOString(),
              deleted_at: null,
            };
            set((s) => ({ ...updateSession(s), messages: [...s.messages.filter((m) => !m.id.startsWith("temp_")), aiMsg] }));
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
            thinking_content: null,
            thinking_duration_ms: null,
            created_at: new Date().toISOString(),
            deleted_at: null,
          };
          set((s) => ({
            messages: [...s.messages, errMsg],
            streamingText: "",
            streamingThinking: "",
            bufferingState: "idle",
            currentAiBlock: null,
            abortController: null,
          }));
        },
      },
    );

    set({ abortController: controller });
  },

  cancelStream: async () => {
    const { streamingText, streamingThinking, currentChatSessionId, abortController } = get();

    const text = streamingText;
    const thinking = streamingThinking || null;

    // 先中断 + 重置 UI，再异步保存
    abortController?.abort();
    set({
      streamingText: "",
      streamingThinking: "",
      bufferingState: "idle",
      currentAiBlock: null,
      bufferElapsed: 0,
      abortController: null,
    });

    // 有内容则保存为中断消息
    if (text.trim() && currentChatSessionId) {
      try {
        const saved = await api.saveInterruptedMessage(currentChatSessionId, {
          content: text,
          thinking_content: thinking,
          thinking_duration_ms: null,
        });
        set((s) => ({ messages: [...s.messages, saved] }));
      } catch (e) {
        console.warn("保存中断消息失败:", e);
      }
    }
  },
}));
