import { useState, useEffect, Component, type ReactNode } from "react";
import { useTranslation, withTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { initBaseUrl, isTauri } from "./services/api";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";
import Topbar from "./components/Topbar";
import SettingsDialog from "./components/SettingsDialog";
import ToastContainer from "./components/Toast";
import Spinner from "./components/Spinner";

interface EBProps { children: ReactNode; t: (key: string) => string }
interface EBState { error: Error | null }
class ErrorBoundaryInner extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{this.props.t("error.render")}</h2>
            <pre style={{ fontSize: 12, opacity: 0.7, whiteSpace: "pre-wrap", textAlign: "left" }}>
              {this.state.error.message}
            </pre>
            <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}>
              {this.props.t("error.retry")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
const ErrorBoundary = withTranslation()(ErrorBoundaryInner as any);

function App() {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setError(t("app.backendTimeout"));
    }, 30000);

    if (isTauri) {
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
      let active = true;
      initBaseUrl().then(() => {
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
      });
      return () => {
        active = false;
        clearTimeout(timeout);
      };
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
          <Spinner style={{ margin: "0 auto 16px" }} />
          <p style={{ fontSize: 14, opacity: 0.7 }}>{t("app.starting")}</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default App;
