import { useTranslation } from "react-i18next";
import { AiBlock, LLMMessage } from "../../types";
import AiBlockRenderer from "./AiBlockRenderer";
import ThinkingCard from "./ThinkingCard";

const INTERRUPTED_MARKER = "<!-- interrupted -->";

interface Props {
  message: LLMMessage;
  streamingText?: string;
  currentAiBlock?: AiBlock | null;
  streamingThinking?: string;
}

export default function ChatMessage({ message, streamingText, currentAiBlock, streamingThinking }: Props) {
  const { t } = useTranslation();
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
  const aiBlock =
    isStreaming && currentAiBlock
      ? currentAiBlock
      : (() => { try { return message.ai_block ? JSON.parse(message.ai_block) : null; } catch { return null; } })();

  const thinkingContent = isStreaming ? streamingThinking : message.thinking_content;
  const thinkingDuration = isStreaming ? null : message.thinking_duration_ms;

  const bodyText = isStreaming ? streamingText : message.content;
  const isInterrupted = !isStreaming && bodyText.includes(INTERRUPTED_MARKER);
  const displayText = isInterrupted ? bodyText.replace(INTERRUPTED_MARKER, "") : bodyText;
  const showBody = isUser || !!(bodyText || "").trim();

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", gap: 6 }}>
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
            {displayText}
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
