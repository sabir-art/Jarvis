import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { postJSON } from "../../api";
import { useJarvis } from "../../state";

function StatusPanel() {
  const activeModel = useJarvis((s) => s.activeModel);
  const activeModelReason = useJarvis((s) => s.activeModelReason);
  const nodes = useJarvis((s) => s.nodes);
  const memories = useJarvis((s) => s.memories);
  const tasks = useJarvis((s) => s.tasks);
  return (
    <section className="panel">
      <div className="panel-title">Statut</div>
      <div className="panel-body">
        <div className="status-row"><span className="k">dernier modèle</span><span className="v">{activeModel ?? "—"}</span></div>
        <div className="status-row"><span className="k">routage</span><span className="v">{activeModelReason ?? "en attente"}</span></div>
        <div className="status-row"><span className="k">nœuds</span><span className="v">{nodes.length}</span></div>
        <div className="status-row"><span className="k">mémoires</span><span className="v">{memories.length}</span></div>
        <div className="status-row"><span className="k">tâches ouvertes</span><span className="v">{tasks.filter((t) => !t.done).length}</span></div>
      </div>
    </section>
  );
}

function TasksPanel() {
  const tasks = useJarvis((s) => s.tasks);
  const toggleTask = useJarvis((s) => s.toggleTask);
  return (
    <section className="panel">
      <div className="panel-title">
        Tâches <span className="count">{tasks.filter((t) => !t.done).length} ouvertes</span>
      </div>
      <div className="panel-body">
        {tasks.length === 0 && <span style={{ color: "var(--text-dim)" }}>Demandez à JARVIS de créer une tâche…</span>}
        {tasks.map((t) => (
          <label key={t.id} className={`task-row ${t.done ? "done" : ""}`}>
            <input type="checkbox" checked={t.done} onChange={() => void toggleTask(t.id)} />
            <span>{t.title}</span>
            {t.due && <span className="task-due">{t.due}</span>}
          </label>
        ))}
      </div>
    </section>
  );
}

function MemoryPanel() {
  const memories = useJarvis((s) => s.memories);
  return (
    <section className="panel">
      <div className="panel-title">
        Mémoire <span className="count">{memories.length}</span>
      </div>
      <div className="panel-body">
        {memories.length === 0 && (
          <span style={{ color: "var(--text-dim)" }}>JARVIS retiendra ici ce qu'il apprend de vous.</span>
        )}
        {memories.slice().reverse().map((m) => (
          <div key={m.id} className="memory-row">
            <div className="memory-cat">{m.category}</div>
            {m.content}
          </div>
        ))}
      </div>
    </section>
  );
}

function WikiPanel() {
  const wikiPages = useJarvis((s) => s.wikiPages);
  const selectNode = useJarvis((s) => s.selectNode);
  const [linting, setLinting] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const runLint = async () => {
    setLinting(true);
    setReport(null);
    try {
      const r = await postJSON<{ report: string }>("/api/wiki/lint");
      setReport(r.report);
    } catch {
      setReport("L'audit a échoué (serveur injoignable ?).");
    } finally {
      setLinting(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-title">
        Wiki <span className="count">{wikiPages.length} pages</span>
      </div>
      <div className="panel-body">
        {wikiPages.length === 0 && (
          <span style={{ color: "var(--text-dim)" }}>
            JARVIS rédigera ici ses pages de synthèse, nourries par vos notes, mémoires et documents.
          </span>
        )}
        {wikiPages
          .slice()
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((p) => (
            <div
              key={p.id}
              className="wiki-row"
              onClick={() => p.nodeId && selectNode(p.nodeId, true)}
              title="Ouvrir dans la galaxie"
            >
              <span className="wiki-title">{p.title}</span>
              <span className="wiki-meta">
                {p.sources} src · {p.updatedAt.slice(0, 10)}
              </span>
            </div>
          ))}
        {wikiPages.length > 0 && (
          <button className="btn" style={{ marginTop: 8 }} disabled={linting} onClick={() => void runLint()}>
            {linting ? "⟳ audit en cours…" : "🧹 Auditer la cohérence (lint)"}
          </button>
        )}
        {report && (
          <div className="lint-report">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}

function SelfDevPanel() {
  const proposals = useJarvis((s) => s.proposals);
  const review = useJarvis((s) => s.reviewProposal);
  const pending = proposals.filter((p) => p.status === "pending");
  return (
    <section className="panel">
      <div className="panel-title">
        Auto-dev <span className="count">{pending.length} en attente</span>
      </div>
      <div className="panel-body">
        {proposals.length === 0 && (
          <span style={{ color: "var(--text-dim)" }}>
            JARVIS peut proposer de nouvelles compétences (code soumis à votre validation).
          </span>
        )}
        {proposals.slice().reverse().map((p) => (
          <div key={p.id} className="proposal">
            <h4>{p.name}</h4>
            <div className="desc">{p.description}</div>
            <details>
              <summary>voir le code proposé</summary>
              <pre>{p.code}</pre>
            </details>
            {p.status === "pending" ? (
              <div className="row">
                <button className="btn success" onClick={() => void review(p.id, "approved")}>✓ Approuver</button>
                <button className="btn danger" onClick={() => void review(p.id, "rejected")}>✕ Rejeter</button>
              </div>
            ) : (
              <span className={`status-${p.status}`}>
                {p.status === "approved" ? "✓ approuvée et active" : "✕ rejetée"}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityPanel() {
  const activity = useJarvis((s) => s.activity);
  return (
    <section className="panel">
      <div className="panel-title">Activité</div>
      <div className="panel-body">
        {activity.length === 0 && <span style={{ color: "var(--text-dim)" }}>Aucune activité pour l'instant.</span>}
        {activity.map((a) => (
          <div key={a.id} className="activity-row">
            <span className="activity-kind">{a.kind}</span>
            <span>{a.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RightPanels() {
  return (
    <aside className="panels">
      <StatusPanel />
      <WikiPanel />
      <TasksPanel />
      <MemoryPanel />
      <SelfDevPanel />
      <ActivityPanel />
    </aside>
  );
}
