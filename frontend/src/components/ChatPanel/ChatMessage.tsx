import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AiBlock, LLMMessage } from "../../types";
import MarkdownRenderer from "./MarkdownRenderer";
import AiBlockRenderer from "./AiBlockRenderer";
import ThinkingCard from "./ThinkingCard";

const INTERRUPTED_MARKER = "<!-- interrupted -->";

interface Props {
  message: LLMMessage;
  streamingText?: string;
  currentAiBlock?: AiBlock | null;
  streamingThinking?: string;
  isLast?: boolean;
  onDelete?: () => void;
}

export default function ChatMessage({ message, streamingText, currentAiBlock, streamingThinking, isLast, onDelete }: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [deleteHovered, setDeleteHovered] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--faint)",
            background: "var(--sand)",
            padding: "2px 10px",
            borderRadius: 10,
          }}
        >
          {message.content}
        </span>
      </div>
    );
  }

  const isStreaming = streamingText !== undefined;
  const aiBlock = useMemo(() => {
    if (isStreaming && currentAiBlock) return currentAiBlock;
    try { return message.ai_block ? JSON.parse(message.ai_block) : null; } catch { return null; }
  }, [isStreaming, currentAiBlock, message.ai_block]);

  const thinkingContent = isStreaming ? streamingThinking : message.thinking_content;
  const thinkingDuration = isStreaming ? null : message.thinking_duration_ms;

  const bodyText = isStreaming ? streamingText : message.content;
  const isInterrupted = !isStreaming && bodyText.includes(INTERRUPTED_MARKER);
  const displayText = isInterrupted ? bodyText.replace(INTERRUPTED_MARKER, "") : bodyText;
  const showBody = isUser || !!(bodyText || "").trim();

  const showDelete = isLast && onDelete && !isStreaming;

  return (
    <div
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ position: "relative", maxWidth: "85%", display: "flex", flexDirection: "column", gap: 6 }}>
        {showDelete && (
          <div
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              position: "absolute",
              top: -8,
              ...(isUser ? { left: -8, right: "unset" } : { right: -8, left: "unset" }),
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#e74c3c",
              color: "#fff",
              display: hovered ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              cursor: "pointer",
              opacity: deleteHovered ? 1 : 0.7,
              transform: deleteHovered ? "scale(1.15)" : "scale(1)",
              zIndex: 2,
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              transition: "opacity 0.15s, transform 0.15s",
            }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
          >
            ✕
          </div>
        )}
        {thinkingContent && (
          <ThinkingCard
            content={thinkingContent}
            durationMs={thinkingDuration}
            streaming={isStreaming}
          />
        )}
        {showBody && (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: isUser ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
              background: isUser ? "var(--accent)" : "var(--card-bg)",
              color: isUser ? "#fff" : "var(--fg)",
              border: isUser ? "none" : "1px solid var(--border)",
              lineHeight: 1.5,
              fontSize: 13,
            }}
          >
            {isUser || isStreaming ? displayText : <MarkdownRenderer content={displayText} />}
            {isStreaming && (
              <span className="animate-pulse" style={{ marginLeft: 1 }}>▊</span>
            )}
            {isInterrupted && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px solid var(--border-s)",
                  fontSize: 10,
                  color: "var(--faint)",
                }}
              >
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--warning, #d4a017)" }} />
                {t("llm.interrupted")}
              </div>
            )}
          </div>
        )}
        {aiBlock && <AiBlockRenderer block={aiBlock} />}
      </div>
    </div>
  );
}
