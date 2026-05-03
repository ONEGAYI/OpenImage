import { LLMMessage } from "../../types";
import AiBlockRenderer from "./AiBlockRenderer";

interface Props {
  message: LLMMessage;
  streamingText?: string;
  currentAiBlock?: Record<string, unknown> | null;
}

export default function ChatMessage({ message, streamingText, currentAiBlock }: Props) {
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

  const aiBlock =
    streamingText !== undefined && currentAiBlock
      ? currentAiBlock
      : (() => { try { return message.ai_block ? JSON.parse(message.ai_block) : null; } catch { return null; } })();

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "85%" }}>
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
          {streamingText !== undefined ? streamingText || "..." : message.content}
          {streamingText !== undefined && streamingText && (
            <span className="animate-pulse" style={{ marginLeft: 1 }}>▊</span>
          )}
        </div>
        {aiBlock && <AiBlockRenderer block={aiBlock} />}
      </div>
    </div>
  );
}
