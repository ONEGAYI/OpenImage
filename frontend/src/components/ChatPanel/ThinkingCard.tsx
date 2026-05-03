import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  content: string;
  durationMs: number | null;
  streaming?: boolean;
}

export default function ThinkingCard({ content, durationMs, streaming }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!content && !streaming) return null;

  const durationSec = durationMs ? Math.round(durationMs / 1000) : 0;
  const isStreaming = streaming && !durationMs;

  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid rgba(201,100,66,0.3)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--card-bg)",
      }}
    >
      <div
        onClick={() => !isStreaming && setExpanded(!expanded)}
        style={{
          padding: "5px 10px",
          background: "rgba(201,100,66,0.06)",
          borderBottom: expanded ? "1px solid rgba(201,100,66,0.15)" : "none",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: isStreaming ? "default" : "pointer",
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 9,
            transition: "transform 0.2s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          ▶
        </span>
        {isStreaming
          ? t("llm.thinking")
          : t("llm.thoughtFor", { seconds: durationSec })}
      </div>
      {expanded && (
        <div
          style={{
            padding: "8px 10px",
            fontSize: 11,
            color: "var(--muted)",
            lineHeight: 1.6,
            maxHeight: 200,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "monospace",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
