import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getSettings, updateSettings, getLLMSettings, updateLLMSettings } from "../services/api";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiMode, setApiMode] = useState<"responses" | "images" | "chat">("chat");
  const [modelName, setModelName] = useState("gpt-image-2");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [resolvedEndpoint, setResolvedEndpoint] = useState("");
  const [fullVersion, setFullVersion] = useState("");
  const [llmApiKey, setLLMApiKey] = useState("");
  const [llmBaseUrl, setLLMBaseUrl] = useState("");
  const [llmModelName, setLLMModelName] = useState("");
  const [llmVision, setLLMVision] = useState(false);
  const [llmSystemPrompt, setLLMSystemPrompt] = useState("");

  useEffect(() => {
    getSettings().then((s) => {
      if (s.api_key) setApiKey(s.api_key);
      if (s.base_url) setBaseUrl(s.base_url);
      if (s.api_mode) setApiMode(s.api_mode);
      if (s.model_name) setModelName(s.model_name);
      if (s.resolved_endpoint) setResolvedEndpoint(s.resolved_endpoint);
      if (s.full_version) setFullVersion(s.full_version);
    });
  }, []);

  useEffect(() => {
    getLLMSettings().then((s) => {
      if (s.llm_api_key) setLLMApiKey(s.llm_api_key);
      if (s.llm_base_url) setLLMBaseUrl(s.llm_base_url);
      if (s.llm_model_name) setLLMModelName(s.llm_model_name);
      if (s.llm_supports_vision) setLLMVision(s.llm_supports_vision);
      if (s.llm_system_prompt) setLLMSystemPrompt(s.llm_system_prompt);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await Promise.all([
        updateSettings({
          api_key: apiKey.trim(),
          ...(baseUrl.trim() && { base_url: baseUrl.trim() }),
          api_mode: apiMode,
          model_name: modelName.trim(),
        }),
        updateLLMSettings({
          llm_api_key: llmApiKey.trim() || undefined,
          llm_base_url: llmBaseUrl.trim() || undefined,
          llm_model_name: llmModelName.trim() || undefined,
          llm_supports_vision: llmVision,
          llm_system_prompt: llmSystemPrompt.trim() || undefined,
        }),
      ]);
      setMessage(t("settings.saved"));
      setTimeout(onClose, 800);
    } catch (err) {
      setMessage(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    background: "var(--input-bg)",
    borderColor: focused ? "var(--accent)" : "var(--border)",
    color: "var(--fg)",
    boxShadow: focused ? "0 0 0 2px rgba(201,100,66,0.1)" : "none",
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "var(--overlay)" }}
    >
      <div
        className="rounded-xl border p-6 w-[420px] max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "0 8px 32px var(--card-shadow)",
        }}
      >
        <h3
          className="text-lg font-medium mb-4"
          style={{ fontFamily: "var(--font-display)", color: "var(--fg)" }}
        >
          {t("settings.title")}
        </h3>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("settings.apiKey")}</label>
        <input
          type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={t("settings.apiKeyPlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("settings.baseUrl")}</label>
        <input
          type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={t("settings.baseUrlPlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />
        <div className="text-xs mb-3" style={{ color: "var(--faint)" }}>{t("settings.baseUrlHint")}</div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("settings.apiMode")}</label>
        <select
          value={apiMode} onChange={(e) => setApiMode(e.target.value as "responses" | "images" | "chat")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none cursor-pointer"
          style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--fg)" }}
        >
          <option value="chat">{t("settings.modeChat")}</option>
          <option value="images">{t("settings.modeImages")}</option>
          <option value="responses">{t("settings.modeResponses")}</option>
        </select>
        <div className="text-xs mb-3" style={{ color: "var(--faint)" }}>{t("settings.modeHint")}</div>

        {resolvedEndpoint && (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs font-mono break-all select-all" style={{ background: "var(--input-bg)", color: "var(--muted)", border: "1px solid var(--border)" }}>
            <span style={{ color: "var(--faint)" }}>{t("settings.endpoint")} </span>{resolvedEndpoint}
          </div>
        )}

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("settings.modelName")}</label>
        <input
          type="text" value={modelName} onChange={(e) => setModelName(e.target.value)}
          placeholder={t("settings.modelNamePlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />
        <div className="text-xs mb-4" style={{ color: "var(--faint)" }}>{t("settings.modelNameHint")}</div>

        <div style={{ borderTop: "1px solid var(--border-s)", margin: "12px 0" }} />

        {/* LLM AI 助手设置 */}
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>
          {t("llm.settingsTitle")}
        </div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("llm.apiKey")}</label>
        <input
          type="password" value={llmApiKey} onChange={(e) => setLLMApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("llm.baseUrl")}</label>
        <input
          type="text" value={llmBaseUrl} onChange={(e) => setLLMBaseUrl(e.target.value)}
          placeholder="http://localhost:11434/v1"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("llm.modelName")}</label>
        <input
          type="text" value={llmModelName} onChange={(e) => setLLMModelName(e.target.value)}
          placeholder="llama3.1:8b"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />

        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={llmVision}
            onChange={(e) => setLLMVision(e.target.checked)}
            className="cursor-pointer"
          />
          <label className="text-sm cursor-pointer" style={{ color: "var(--muted)" }}>{t("llm.visionSupport")}</label>
        </div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>{t("llm.systemPrompt")}</label>
        <textarea
          value={llmSystemPrompt} onChange={(e) => setLLMSystemPrompt(e.target.value)}
          placeholder={t("llm.systemPromptPlaceholder")}
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none resize-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />

        {message && <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>{message}</div>}

        {fullVersion && (
          <div
            className="text-xs text-center mb-3 select-all"
            style={{ color: "var(--faint)", fontFamily: "monospace" }}
          >
            {fullVersion}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg transition-colors cursor-pointer" style={{ color: "var(--muted)" }}>
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="px-4 py-1.5 text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#faf9f5" }}
          >
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
