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
        border: "1px solid rgba(201,100,66,0.3)",
        borderRadius: "var(--radius-sm)",
        background: "var(--card-bg)",
        overflow: "clip",
      }}
    >
      <div
        onClick={() => !isStreaming && setExpanded(!expanded)}
        style={{
          padding: "5px 10px",
          ...(expanded
            ? {
                backgroundColor: "var(--card-bg)",
                backgroundImage: "linear-gradient(rgba(201,100,66,0.06), rgba(201,100,66,0.06))",
                borderBottom: "1.5px solid rgba(201,100,66,0.25)",
                borderRadius: "7px 7px 0 0",
                position: "sticky" as const,
                top: 0,
                zIndex: 1,
              }
            : {
                background: "rgba(201,100,66,0.06)",
                borderRadius: "var(--radius-sm)",
              }),
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
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "monospace",
          }}
        >
          {content}
          {isStreaming && <span className="animate-pulse" style={{ opacity: 0.5 }}>▊</span>}
        </div>
      )}
    </div>
  );
}
