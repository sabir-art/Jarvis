import type { FC } from "react";
import { useJarvis } from "../state";
import type { ViewName } from "../types";
import { IconBook, IconBrain, IconChat, IconChecklist, IconPlug, IconSparkles } from "./icons";

const ITEMS: { view: ViewName; label: string; icon: FC<{ size?: number }> }[] = [
  { view: "home", label: "Jarvis", icon: IconChat },
  { view: "brain", label: "Cerveau", icon: IconBrain },
  { view: "wiki", label: "Wiki", icon: IconBook },
  { view: "connectors", label: "Connecteurs", icon: IconPlug },
  { view: "tasks", label: "Agenda & tâches", icon: IconChecklist },
  { view: "autodev", label: "Auto-dev", icon: IconSparkles },
];

export default function NavRail() {
  const view = useJarvis((s) => s.view);
  const setView = useJarvis((s) => s.setView);
  const demoMode = useJarvis((s) => s.demoMode);
  const pending = useJarvis((s) => s.proposals).filter((p) => p.status === "pending").length;

  return (
    <nav className="rail">
      <div className="rail-orb" onClick={() => setView("home")} title="Jarvis">
        <span />
      </div>
      {ITEMS.map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          className={`rail-btn ${view === v ? "active" : ""}`}
          onClick={() => setView(v)}
          title={label}
          aria-label={label}
        >
          <Icon size={21} />
          {v === "autodev" && pending > 0 && <i className="rail-badge">{pending}</i>}
        </button>
      ))}
      <div className="rail-foot" title={demoMode ? "Mode démo — aucune consommation API" : "Liaison Claude active"}>
        <span className={`rail-dot ${demoMode ? "demo" : "live"}`} />
      </div>
    </nav>
  );
}
