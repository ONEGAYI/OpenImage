import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";
import Topbar from "./components/Topbar";
import SettingsDialog from "./components/SettingsDialog";
import { waitForBackend } from "./services/api";

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    waitForBackend()
      .then(() => setReady(true))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg)", color: "var(--fg)" }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Failed to start backend
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
          <p style={{ fontSize: 14, opacity: 0.7 }}>Starting OpenImage...</p>
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
    </div>
  );
}

export default App;
