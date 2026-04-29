import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";
import Topbar from "./components/Topbar";
import SettingsDialog from "./components/SettingsDialog";

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenSettings={() => setShowSettings(true)} />
        <Gallery />
        <InputArea onOpenSettings={() => setShowSettings(true)} />
      </div>
      <DetailPanel />
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
