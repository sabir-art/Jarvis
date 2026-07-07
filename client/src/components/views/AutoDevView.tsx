import { useJarvis } from "../../state";
import { IconCheck, IconClose, IconSparkles } from "../icons";

/**
 * Auto-développement supervisé : Jarvis propose de nouvelles compétences
 * (il en écrit le code), rien ne s'active sans votre validation.
 */
export default function AutoDevView() {
  const proposals = useJarvis((s) => s.proposals);
  const activity = useJarvis((s) => s.activity);
  const review = useJarvis((s) => s.reviewProposal);

  return (
    <div className="view autodev-view">
      <header className="view-head">
        <div>
          <h1>Auto-développement</h1>
          <p>Jarvis peut écrire ses propres outils. Vous validez, il s'améliore — jamais sans vous.</p>
        </div>
      </header>

      <div className="autodev-layout">
        <section>
          {proposals.length === 0 && (
            <div className="glass card empty-card">
              <IconSparkles size={26} />
              <p>Aucune proposition pour l'instant. Essayez : <b>« Jarvis, propose-toi une compétence pour convertir des devises »</b> (mode complet avec clé API).</p>
            </div>
          )}
          {proposals.slice().reverse().map((p) => (
            <article key={p.id} className="glass card proposal-card">
              <div className="proposal-head">
                <h2>{p.name}</h2>
                {p.status === "pending" ? (
                  <span className="pill status-demo">En attente</span>
                ) : (
                  <span className={`pill ${p.status === "approved" ? "status-connected" : "status-off"}`}>
                    {p.status === "approved" ? "Active" : "Rejetée"}
                  </span>
                )}
              </div>
              <p>{p.description}</p>
              <p className="muted">{p.rationale}</p>
              <details>
                <summary>Code proposé</summary>
                <pre>{p.code}</pre>
              </details>
              {p.status === "pending" && (
                <div className="proposal-actions">
                  <button className="glass-btn ok" onClick={() => void review(p.id, "approved")}>
                    <IconCheck size={15} /> Approuver
                  </button>
                  <button className="glass-btn danger" onClick={() => void review(p.id, "rejected")}>
                    <IconClose size={15} /> Rejeter
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>

        <aside className="glass card">
          <h2>Journal d'activité</h2>
          {activity.length === 0 && <p className="muted">Rien pour l'instant.</p>}
          {activity.slice(0, 30).map((a) => (
            <div key={a.id} className="activity-line">
              <span className="activity-kind">{a.kind}</span>
              {a.message}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
