import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AiBlockQuestions, QuestionField } from "../../types";
import { useLLMChatStore } from "../../stores/llmChatStore";

interface Props {
  block: AiBlockQuestions;
}

export default function QuestionForm({ block }: Props) {
  const { t } = useTranslation();
  const sendMessage = useLLMChatStore((s) => s.sendMessage);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    const missing = block.fields
      .filter((f) => f.required)
      .filter((f) => !values[f.id] || (Array.isArray(values[f.id]) && (values[f.id] as string[]).length === 0));
    if (missing.length > 0) {
      setErrors(missing.map((f) => f.id));
      return;
    }
    const parts = block.fields
      .filter((f) => values[f.id])
      .map((f) => `${f.label}：${Array.isArray(values[f.id]) ? (values[f.id] as string[]).join("、") : values[f.id]}`);
    sendMessage(parts.join("，"), undefined, values as Record<string, string>);
  };

  const handleSkip = () => {
    sendMessage("跳过了提问");
  };

  const setValue = (id: string, value: string | string[]) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => prev.filter((e) => e !== id));
  };

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "4px 8px",
    border: `1px solid ${hasError ? "var(--error)" : "var(--border)"}`,
    borderRadius: 4,
    fontSize: 11,
    color: "var(--fg)",
    background: "var(--input-bg)",
    boxSizing: "border-box" as const,
  });

  const renderField = (field: QuestionField) => {
    const hasError = errors.includes(field.id);
    switch (field.widget) {
      case "radio":
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {(field.options || []).map((opt) => (
              <label
                key={opt}
                onClick={() => setValue(field.id, opt)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  border: `1px solid ${values[field.id] === opt ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  color: values[field.id] === opt ? "var(--accent)" : "var(--muted)",
                  background: values[field.id] === opt ? "rgba(201,100,66,0.06)" : "transparent",
                }}
              >
                {opt}
              </label>
            ))}
          </div>
        );
      case "select":
        return (
          <select
            value={(values[field.id] as string) || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            style={{ ...inputStyle(hasError), marginTop: 4 }}
          >
            <option value="">{t("llm.optional")}</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "checkbox":
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {(field.options || []).map((opt) => {
              const selected = (values[field.id] as string[]) || [];
              const isChecked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  onClick={() => {
                    const newVal = isChecked ? selected.filter((s) => s !== opt) : [...selected, opt];
                    setValue(field.id, newVal);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    border: `1px solid ${isChecked ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    color: isChecked ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {opt}
                </label>
              );
            })}
          </div>
        );
      case "textarea":
        return (
          <textarea
            value={(values[field.id] as string) || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            style={{ ...inputStyle(hasError), marginTop: 4, resize: "vertical" }}
          />
        );
      default:
        return (
          <input
            type="text"
            value={(values[field.id] as string) || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            placeholder={field.placeholder}
            style={{ ...inputStyle(hasError), marginTop: 4 }}
          />
        );
    }
  };

  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid var(--accent)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--card-bg)",
      }}
    >
      {block.message && (
        <div
          style={{
            padding: "6px 10px",
            background: "rgba(201,100,66,0.06)",
            borderBottom: "1px solid rgba(201,100,66,0.15)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
          }}
        >
          {block.message}
        </div>
      )}
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {block.fields.map((field) => (
          <div key={field.id}>
            <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
              {field.required && <span style={{ color: "var(--accent)" }}>* </span>}
              {field.label}
              {!field.required && <span style={{ fontSize: 9, color: "var(--faint)" }}> ({t("llm.optional")})</span>}
            </label>
            {renderField(field)}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
          <button
            onClick={handleSkip}
            style={{ fontSize: 11, padding: "4px 14px", background: "var(--card-bg)", color: "var(--faint)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
          >
            {t("llm.skip")}
          </button>
          <button
            onClick={handleSubmit}
            style={{ fontSize: 11, padding: "4px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
          >
            {t("llm.submitAnswer")}
          </button>
        </div>
      </div>
    </div>
  );
}
