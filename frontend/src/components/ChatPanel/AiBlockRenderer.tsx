import { useMemo } from "react";
import { AiBlock, AiBlockQuestions, AiBlockSuggestions } from "../../types";
import QuestionForm from "./QuestionForm";
import SuggestionCards from "./SuggestionCards";
import { useTranslation } from "react-i18next";

interface Props {
  block: AiBlock;
}

/** 将对象格式的 options 规范化为字符串数组。 */
function normalizeOptions(options: unknown[]): string[] {
  return options.map((opt) => {
    if (typeof opt === "string") return opt;
    if (opt && typeof opt === "object") {
      const o = opt as Record<string, unknown>;
      return (o.label as string) || (o.value as string) || String(opt);
    }
    return String(opt);
  });
}

/** 规范化 LLM 返回的 ai_block — 兼容 LLM 输出格式的不确定性。 */
function normalizeBlock(raw: unknown): AiBlock {
  const r = raw as Record<string, unknown>;
  const toArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

  // 推断缺失的 type（不直接修改传入对象）
  let blockType = r.type as string | undefined;
  if (!blockType) {
    if (Array.isArray(r.questions) || Array.isArray(r.fields)) blockType = "questions";
    else if (Array.isArray(r.suggestions) || Array.isArray(r.items) || Array.isArray(r.options)) blockType = "suggestions";
  }

  if (blockType === "questions") {
    const fields = toArray(r.fields || r.data || r.questions).map((f) => {
      const field = { ...(f as Record<string, unknown>) };
      if (field.options) field.options = normalizeOptions(toArray(field.options));
      return field;
    }) as AiBlockQuestions["fields"];
    return {
      type: "questions",
      message: (r.message as string) || "",
      fields,
    };
  }
  if (blockType === "suggestions") {
    return {
      type: "suggestions",
      message: (r.message as string) || "",
      items: toArray(r.items || r.data || r.options || r.suggestions) as AiBlockSuggestions["items"],
    };
  }
  return raw as AiBlock;
}

export default function AiBlockRenderer({ block }: Props) {
  const { t } = useTranslation();
  const norm = useMemo(() => normalizeBlock(block), [block]);
  if (norm.type === "questions") {
    return <QuestionForm block={norm as AiBlockQuestions} />;
  }
  if (norm.type === "suggestions") {
    return <SuggestionCards block={norm as AiBlockSuggestions} />;
  }
  // 无法识别的格式 — 红色错误卡片展示原始内容，避免静默丢弃
  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid var(--error)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--card-bg)",
      }}
    >
      <div
        style={{
          padding: "5px 10px",
          background: "rgba(220,38,38,0.08)",
          borderBottom: "1px solid rgba(220,38,38,0.2)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--error)",
          letterSpacing: 0.5,
        }}
      >
        {t("llm.blockParseError")}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "8px 10px",
          fontSize: 10,
          color: "var(--muted)",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontFamily: "monospace",
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {JSON.stringify(norm, null, 2)}
      </pre>
    </div>
  );
}
