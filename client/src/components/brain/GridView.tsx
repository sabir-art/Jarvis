import { useMemo, useState } from "react";
import { useJarvis } from "../../state";
import { clusterColor, TYPE_LABELS } from "./layout";

/**
 * Vue « Grille » : la connaissance du cerveau, organisée par domaine.
 * Chaque domaine est une carte listant ses nœuds ; un clic ouvre le détail,
 * le bouton ✦ envoie la caméra dessus dans la vue Galaxie.
 */
export default function GridView({ onOpenInGalaxy }: { onOpenInGalaxy: () => void }) {
  const nodes = useJarvis((s) => s.nodes);
  const selectNode = useJarvis((s) => s.selectNode);
  const [filter, setFilter] = useState("");

  const domains = useMemo(() => {
    const hubs = nodes.filter((n) => n.type === "hub");
    const f = filter.trim().toLowerCase();
    return hubs
      .map((hub) => ({
        hub,
        items: nodes
          .filter((n) => n.type !== "hub" && n.cluster === hub.id)
          .filter(
            (n) =>
              !f ||
              n.label.toLowerCase().includes(f) ||
              n.content.toLowerCase().includes(f) ||
              n.tags.some((t) => t.toLowerCase().includes(f)),
          )
          .slice()
          .reverse(),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [nodes, filter]);

  return (
    <div className="grid-view">
      <input
        className="grid-filter"
        value={filter}
        placeholder="⌕ filtrer la connaissance…"
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="grid-domains">
        {domains.map(({ hub, items }) => {
          const color = clusterColor(hub.id);
          return (
            <section key={hub.id} className="domain-card" style={{ borderColor: `${color}44` }}>
              <header style={{ color }}>
                <span className="hub-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                {hub.label}
                <span className="hub-count">{items.length}</span>
              </header>
              <p className="domain-desc">{hub.content}</p>
              <div className="domain-items">
                {items.length === 0 && <span className="domain-empty">rien pour l'instant</span>}
                {items.map((n) => (
                  <div key={n.id} className="node-card" onClick={() => selectNode(n.id, false)}>
                    <div className="node-card-head">
                      <span className="node-card-type" style={{ color }}>
                        {TYPE_LABELS[n.type] ?? n.type}
                      </span>
                      <button
                        className="node-card-fly"
                        title="Voir dans la galaxie"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectNode(n.id, true);
                          onOpenInGalaxy();
                        }}
                      >
                        ✦
                      </button>
                    </div>
                    <div className="node-card-label">{n.label}</div>
                    {n.content && <div className="node-card-content">{n.content.slice(0, 140)}</div>}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
