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
    // Le wiki s'enrichit en arrière-plan après chaque ingestion : on
    // rafraîchit périodiquement le graphe et les panneaux (hors streaming).
    const timer = setInterval(() => {
      const s = useJarvis.getState();
      if (!s.streaming) {
        void s.refreshGraph();
        void s.refreshPanels();
      }
    }, 25000);
    return () => clearInterval(timer);
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
