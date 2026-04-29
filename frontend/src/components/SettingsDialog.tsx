import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "../services/api";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiMode, setApiMode] = useState<"responses" | "images" | "chat">("chat");
  const [modelName, setModelName] = useState("gpt-image-2");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSettings().then((s) => {
      if (s.api_key) setApiKey(s.api_key);
      if (s.base_url) setBaseUrl(s.base_url);
      if (s.api_mode) setApiMode(s.api_mode);
      if (s.model_name) setModelName(s.model_name);
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
      setMessage("Settings saved");
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
          Settings
        </h3>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>API Key</label>
        <input
          type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>API Base URL</label>
        <input
          type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />
        <div className="text-xs mb-3" style={{ color: "var(--faint)" }}>留空则使用 OpenAI 默认地址</div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>API 模式</label>
        <select
          value={apiMode} onChange={(e) => setApiMode(e.target.value as "responses" | "images" | "chat")}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none cursor-pointer"
          style={{ background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--fg)" }}
        >
          <option value="chat">Chat Completions（/v1/chat/completions，推荐）</option>
          <option value="images">Images API（/v1/images/generations）</option>
          <option value="responses">Responses API（OpenAI 原生，支持多轮编辑）</option>
        </select>
        <div className="text-xs mb-3" style={{ color: "var(--faint)" }}>第三方代理推荐 Chat Completions 或 Images API</div>

        <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>模型名称</label>
        <input
          type="text" value={modelName} onChange={(e) => setModelName(e.target.value)}
          placeholder="gpt-image-2"
          className="w-full border rounded-lg px-3 py-2 text-sm mb-1 outline-none"
          style={inputStyle(false)}
          onFocus={(e) => { Object.assign(e.currentTarget.style, inputStyle(true)); }}
          onBlur={(e) => { Object.assign(e.currentTarget.style, inputStyle(false)); }}
        />
        <div className="text-xs mb-4" style={{ color: "var(--faint)" }}>图像生成模型 ID，如 gpt-image-2、gemini-2.5-flash-image 等</div>

        {message && <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>{message}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg transition-colors cursor-pointer" style={{ color: "var(--muted)" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="px-4 py-1.5 text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#faf9f5" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
