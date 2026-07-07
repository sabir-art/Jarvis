import { useEffect } from "react";
import NavRail from "./components/NavRail";
import HomeView from "./components/HomeView";
import BrainCanvas from "./components/brain/BrainCanvas";
import WikiView from "./components/views/WikiView";
import ConnectorsView from "./components/views/ConnectorsView";
import TasksView from "./components/views/TasksView";
import AutoDevView from "./components/views/AutoDevView";
import PopupHost from "./components/PopupHost";
import { useJarvis } from "./state";
import { useVoiceEngine } from "./voice";

export default function App() {
  const bootstrap = useJarvis((s) => s.bootstrap);
  const view = useJarvis((s) => s.view);

  // Écoute continue du mot d'activation « Jarvis ».
  useVoiceEngine();

  useEffect(() => {
    void bootstrap();
    // Le cerveau évolue en arrière-plan (wiki, ingestions) : rafraîchissement doux.
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
    <div className="shell">
      <NavRail />
      <main className="stage">
        {view === "home" && <HomeView />}
        {view === "brain" && <BrainCanvas />}
        {view === "wiki" && <WikiView />}
        {view === "connectors" && <ConnectorsView />}
        {view === "tasks" && <TasksView />}
        {view === "autodev" && <AutoDevView />}
        <PopupHost />
      </main>
    </div>
  );
}
