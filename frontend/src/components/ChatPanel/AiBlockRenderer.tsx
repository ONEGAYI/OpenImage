import { AiBlock, AiBlockQuestions, AiBlockSuggestions } from "../../types";
import QuestionForm from "./QuestionForm";
import SuggestionCards from "./SuggestionCards";

interface Props {
  block: AiBlock;
}

/** 规范化 LLM 返回的 ai_block 字段名（LLM 可能用 data 代替 fields/items）。 */
function normalizeBlock(raw: unknown): AiBlock {
  const r = raw as Record<string, unknown>;
  const toArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

  if (r.type === "questions") {
    return {
      type: "questions",
      message: (r.message as string) || "",
      fields: toArray(r.fields || r.data) as AiBlockQuestions["fields"],
    };
  }
  if (r.type === "suggestions") {
    return {
      type: "suggestions",
      message: (r.message as string) || "",
      items: toArray(r.items || r.data) as AiBlockSuggestions["items"],
    };
  }
  return raw as AiBlock;
}

export default function AiBlockRenderer({ block }: Props) {
  const norm = normalizeBlock(block);
  if (norm.type === "questions") {
    return <QuestionForm block={norm as AiBlockQuestions} />;
  }
  if (norm.type === "suggestions") {
    return <SuggestionCards block={norm as AiBlockSuggestions} />;
  }
  return null;
}
