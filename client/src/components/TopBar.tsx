import { useEffect, useRef, useState } from "react";
import { getJSON } from "../api";
import { useJarvis } from "../state";
import type { BrainNode, ModelChoice } from "../types";
import { TYPE_LABELS } from "./brain/layout";

export default function TopBar() {
  const modelChoice = useJarvis((s) => s.modelChoice);
  const setModelChoice = useJarvis((s) => s.setModelChoice);
  const activeModel = useJarvis((s) => s.activeModel);
  const apiKeyConfigured = useJarvis((s) => s.apiKeyConfigured);
  const nodes = useJarvis((s) => s.nodes);
  const selectNode = useJarvis((s) => s.selectNode);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrainNode[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await getJSON<{ nodes: BrainNode[] }>(`/api/brain/search?q=${encodeURIComponent(query)}`);
        setResults(r.nodes);
      } catch {
        setResults([]);
      }
    }, 200);
  }, [query]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="reactor" />
        JARVIS
      </div>

      <div className="top-search">
        <input
          value={query}
          placeholder="⌕ chercher dans le cerveau…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="search-results">
            {results.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  selectNode(n.id, true);
                  setQuery("");
                  setResults([]);
                }}
              >
                <span className="kind">{TYPE_LABELS[n.type] ?? n.type}</span>
                {n.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="top-status">
        <span title="Nœuds dans le cerveau">◈ {nodes.length} nœuds</span>
        <span title={activeModel ?? "aucun appel encore"}>
          <span className={`dot ${apiKeyConfigured ? "on" : "off"}`} />
          {apiKeyConfigured ? "liaison OK" : "clé API absente"}
        </span>
        <select
          className="model-select"
          value={modelChoice}
          title="Choix du modèle : auto = JARVIS décide"
          onChange={(e) => setModelChoice(e.target.value as ModelChoice)}
        >
          <option value="auto">◈ modèle : auto</option>
          <option value="fast">haiku — rapide</option>
          <option value="balanced">sonnet — équilibré</option>
          <option value="deep">opus — profond</option>
        </select>
      </div>
    </header>
  );
}
