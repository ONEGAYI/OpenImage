import Sidebar from "./components/Sidebar";
import Gallery from "./components/Gallery";
import InputArea from "./components/InputArea";
import DetailPanel from "./components/DetailPanel";

function App() {
  return (
    <div className="flex h-screen bg-[#0f172a] text-[#e2e8f0]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Gallery />
        <InputArea />
      </div>
      <DetailPanel />
    </div>
  );
}

export default App;
