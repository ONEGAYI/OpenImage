import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../../stores/llmChatStore";
import ChatMessage from "./ChatMessage";
import ChatSessionBar from "./ChatSessionBar";
import BufferingIndicator from "./BufferingIndicator";

export default function ChatPanel() {
  const { t } = useTranslation();
  const panelExpanded = useLLMChatStore((s) => s.panelExpanded);
  const setPanelExpanded = useLLMChatStore((s) => s.setPanelExpanded);
  const messages = useLLMChatStore((s) => s.messages);
  const streamingText = useLLMChatStore((s) => s.streamingText);
  const streamingThinking = useLLMChatStore((s) => s.streamingThinking);
  const bufferingState = useLLMChatStore((s) => s.bufferingState);
  const currentAiBlock = useLLMChatStore((s) => s.currentAiBlock);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [isFollowing, setIsFollowing] = useState(true);

  const isStreaming = !!streamingText || !!streamingThinking;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsFollowing(atBottom);
  }, []);

  // 消息变化时滚动（仅在跟随模式下）
  useEffect(() => {
    if (!isFollowing) return;
    scrollToBottom();
  }, [messages, isFollowing, scrollToBottom]);

  // 流式 token 通过 rAF 节流滚动
  useEffect(() => {
    if (!isStreaming || !isFollowing) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(rafRef.current);
  }, [streamingText, streamingThinking, isStreaming, isFollowing, scrollToBottom]);

  // 新对话/首次展开时重置为跟随模式
  useEffect(() => {
    setIsFollowing(true);
  }, [panelExpanded]);

  if (!panelExpanded) {
    const lastMsg = messages[messages.length - 1];
    const summary = lastMsg?.content?.slice(0, 60) || "";
    return (
      <div
        onClick={() => setPanelExpanded(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          cursor: "pointer",
          borderBottom: "1px solid var(--border-s)",
          fontSize: 12,
          color: "var(--muted)",
          minHeight: 36,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary}
        </span>
        <span style={{ color: "var(--faint)", fontSize: 10 }}>{t("llm.expand")}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        right: 0,
        height: "45vh",
        display: "flex",
        flexDirection: "column",
        borderBottom: "1px solid var(--border)",
        zIndex: 10,
        background: "var(--bg)",
      }}
    >
      <ChatSessionBar />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {/* 流式生成中的虚拟 assistant 消息 — messages 数组中没有 assistant，需要单独渲染 */}
        {isStreaming && (
          <ChatMessage
            message={{
              id: "__streaming__",
              chat_session_id: "",
              role: "assistant",
              content: "",
              ai_block: null,
              token_count: 0,
              attachments: null,
              thinking_content: null,
              thinking_duration_ms: null,
              created_at: new Date().toISOString(),
              deleted_at: null,
            }}
            streamingText={streamingText || ""}
            currentAiBlock={currentAiBlock}
            streamingThinking={streamingThinking}
          />
        )}
        {bufferingState === "buffering" && <BufferingIndicator />}
      </div>
      {!isFollowing && (
        <div
          onClick={() => {
            setIsFollowing(true);
            scrollToBottom();
          }}
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "4px 14px",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 12,
            fontSize: 11,
            cursor: "pointer",
            zIndex: 5,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {t("llm.scrollToLatest")}
        </div>
      )}
    </div>
  );
}
