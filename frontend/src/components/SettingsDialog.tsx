import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getSettings, updateSettings } from "../services/api";

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

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await updateSettings({
        api_key: apiKey.trim(),
        ...(baseUrl.trim() && { base_url: baseUrl.trim() }),
        api_mode: apiMode,
        model_name: modelName.trim(),
      });
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
