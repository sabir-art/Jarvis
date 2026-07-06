import { useEffect } from "react";
import TopBar from "./components/TopBar";
import ChatPanel from "./components/chat/ChatPanel";
import BrainCanvas from "./components/brain/BrainCanvas";
import RightPanels from "./components/panels/RightPanels";
import { useJarvis } from "./state";

export default function App() {
  const bootstrap = useJarvis((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="app">
      <TopBar />
      <ChatPanel />
      <BrainCanvas />
      <RightPanels />
    </div>
  );
}
