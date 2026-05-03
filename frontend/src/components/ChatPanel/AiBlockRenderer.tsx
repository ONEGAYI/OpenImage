import { AiBlock, AiBlockQuestions, AiBlockSuggestions } from "../../types";
import QuestionForm from "./QuestionForm";
import SuggestionCards from "./SuggestionCards";

interface Props {
  block: AiBlock;
}

export default function AiBlockRenderer({ block }: Props) {
  if (block.type === "questions") {
    return <QuestionForm block={block as AiBlockQuestions} />;
  }
  if (block.type === "suggestions") {
    return <SuggestionCards block={block as AiBlockSuggestions} />;
  }
  return null;
}
