import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getJSON, postJSON } from "../../api";
import { useJarvis } from "../../state";
import { IconBroom } from "../icons";

interface FullPage {
  slug: string;
  title: string;
  content: string;
  sources: string[];
  updatedAt: string;
}

/** Le wiki de JARVIS : synthèses rédigées et entretenues automatiquement. */
export default function WikiView() {
  const wikiPages = useJarvis((s) => s.wikiPages);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<FullPage | null>(null);
  const [linting, setLinting] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && wikiPages.length) setSelected(wikiPages[0].slug);
  }, [wikiPages, selected]);

  useEffect(() => {
    if (!selected) return;
    getJSON<{ page: FullPage }>(`/api/wiki/${selected}`)
      .then((r) => setPage(r.page))
      .catch(() => setPage(null));
  }, [selected]);

  const runLint = async () => {
    setLinting(true);
    setReport(null);
    try {
      const r = await postJSON<{ report: string }>("/api/wiki/lint");
      setReport(r.report);
    } catch {
      setReport("L'audit a échoué.");
    } finally {
      setLinting(false);
    }
  };

  return (
    <div className="view wiki-view">
      <header className="view-head">
        <div>
          <h1>Wiki</h1>
          <p>La connaissance compilée par Jarvis — mise à jour à chaque note, mémoire ou document.</p>
        </div>
        <button className="glass-btn" disabled={linting || wikiPages.length === 0} onClick={() => void runLint()}>
          <IconBroom size={16} /> {linting ? "Audit en cours…" : "Auditer la cohérence"}
        </button>
      </header>

      {report && (
        <div className="lint-report">
          <ReactMarkdown>{report}</ReactMarkdown>
        </div>
      )}

      <div className="wiki-layout">
        <aside className="wiki-list">
          {wikiPages.length === 0 && (
            <p className="muted">Le wiki se construira au fil de vos notes, mémoires et documents.</p>
          )}
          {wikiPages
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((p) => (
              <button
                key={p.slug}
                className={`wiki-item ${selected === p.slug ? "active" : ""}`}
                onClick={() => setSelected(p.slug)}
              >
                <span className="wiki-item-title">{p.title}</span>
                <span className="wiki-item-meta">{p.sources} source{p.sources > 1 ? "s" : ""} · {p.updatedAt.slice(0, 10)}</span>
              </button>
            ))}
        </aside>
        <article className="wiki-reader glass">
          {page ? (
            <ReactMarkdown>{page.content}</ReactMarkdown>
          ) : (
            <p className="muted">Sélectionnez une page.</p>
          )}
        </article>
      </div>
    </div>
  );
}
