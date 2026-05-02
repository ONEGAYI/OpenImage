import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { initBaseUrl } from "./services/api";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";
import Topbar from "./components/Topbar";
import SettingsDialog from "./components/SettingsDialog";
import ToastContainer from "./components/Toast";

function App() {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setError(t("app.backendTimeout"));
    }, 30000);

    if ("__TAURI_INTERNALS__" in window) {
      const unlistenReady = listen("backend-ready", async () => {
        try {
          await initBaseUrl();
          clearTimeout(timeout);
          setReady(true);
        } catch (e) {
          clearTimeout(timeout);
          setError(String(e));
        }
      });

      const unlistenError = listen<string>("backend-error", (e) => {
        clearTimeout(timeout);
        setError(e.payload);
      });

      return () => {
        unlistenReady.then((fn) => fn());
        unlistenError.then((fn) => fn());
        clearTimeout(timeout);
      };
    } else {
      // Web 模式：baseUrl 为空字符串（Vite proxy），直接用相对路径 poll
      initBaseUrl().then(() => {
        let active = true;
        const poll = async () => {
          while (active) {
            try {
              const res = await fetch("/api/settings");
              if (res.ok) {
                clearTimeout(timeout);
                setReady(true);
                return;
              }
            } catch {}
            await new Promise((r) => setTimeout(r, 500));
          }
        };
        poll();
        return () => {
          active = false;
          clearTimeout(timeout);
        };
      });
    }
  }, []);

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg)", color: "var(--fg)" }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {t("app.backendFailed")}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg)", color: "var(--fg)" }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ fontSize: 14, opacity: 0.7 }}>{t("app.starting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div className="shrink-0"><Sidebar /></div>
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenSettings={() => setShowSettings(true)} />
        <Gallery />
        <InputArea onOpenSettings={() => setShowSettings(true)} />
      </div>
      <div className="shrink-0 overflow-hidden"><DetailPanel /></div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      <ToastContainer />
    </div>
  );
}

export default App;
