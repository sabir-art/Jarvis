import { useEffect, useState } from "react";
import { getJSON } from "../../api";
import { useJarvis } from "../../state";
import type { ConnectorInfo } from "../../types";
import { BRAND_ICONS, IconClose } from "../icons";

/**
 * Connecteurs : les ponts de JARVIS vers vos services.
 * En mode démo, chaque connecteur montre des données simulées réalistes —
 * l'expérience complète, sans OAuth ni coût.
 */

type ConnectorPayload = Record<string, unknown>;

function DataPreview({ id, data }: { id: string; data: ConnectorPayload }) {
  switch (id) {
    case "gmail": {
      const emails = data.emails as { from: string; subject: string; preview: string; time: string; unread: boolean }[];
      return (
        <ul className="data-list">
          {emails.map((e, i) => (
            <li key={i} className={e.unread ? "unread" : ""}>
              <div className="row-head"><b>{e.from}</b><span>{e.time}</span></div>
              <div className="row-title">{e.subject}</div>
              <div className="row-sub">{e.preview}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "gcal": {
      const events = data.events as { title: string; start: string; end: string; where: string; day: string }[];
      return (
        <ul className="data-list">
          {events.map((e, i) => (
            <li key={i}>
              <div className="row-head"><b>{e.start}–{e.end}</b><span>{e.day}</span></div>
              <div className="row-title">{e.title}</div>
              <div className="row-sub">{e.where}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "spotify": {
      const d = data as { nowPlaying: { title: string; artist: string }; playlists: { name: string; tracks: number; duration: string }[] };
      return (
        <>
          <div className="now-playing">
            <span className="eq"><i /><i /><i /></span>
            <div>
              <div className="row-title">{d.nowPlaying.title}</div>
              <div className="row-sub">{d.nowPlaying.artist}</div>
            </div>
          </div>
          <ul className="data-list">
            {d.playlists.map((p, i) => (
              <li key={i}>
                <div className="row-head"><b>{p.name}</b><span>{p.duration}</span></div>
                <div className="row-sub">{p.tracks} titres</div>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "slack": {
      const messages = data.messages as { channel: string; from: string; text: string; time: string }[];
      return (
        <ul className="data-list">
          {messages.map((m, i) => (
            <li key={i}>
              <div className="row-head"><b>{m.channel}</b><span>{m.time}</span></div>
              <div className="row-sub"><b>{m.from}</b> — {m.text}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "chrome": {
      const history = data.history as { title: string; url: string; when: string }[];
      return (
        <ul className="data-list">
          {history.map((h, i) => (
            <li key={i}>
              <div className="row-title">{h.title}</div>
              <div className="row-sub">{h.url} · {h.when}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "webflow": {
      const site = data.site as { site: string; pages: number; publishedAt: string; visits7d: number };
      return (
        <ul className="data-list">
          <li><div className="row-title">{site.site}</div><div className="row-sub">{site.pages} pages · publié {site.publishedAt} · {site.visits7d} visites / 7 j</div></li>
        </ul>
      );
    }
    default: {
      const list = (data.files ?? data.pages ?? data.assets ?? data.jobs ?? []) as Record<string, string>[];
      return (
        <ul className="data-list">
          {list.map((f, i) => (
            <li key={i}>
              <div className="row-title">{f.name ?? f.title}</div>
              <div className="row-sub">{[f.kind, f.modified ?? f.edited ?? f.status].filter(Boolean).join(" · ")}</div>
            </li>
          ))}
        </ul>
      );
    }
  }
}

export default function ConnectorsView() {
  const connectors = useJarvis((s) => s.connectors);
  const [open, setOpen] = useState<ConnectorInfo | null>(null);
  const [data, setData] = useState<ConnectorPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    getJSON<{ data: ConnectorPayload }>(`/api/connectors/${open.id}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [open]);

  return (
    <div className="view connectors-view">
      <header className="view-head">
        <div>
          <h1>Connecteurs</h1>
          <p>Les ponts entre Jarvis et vos services. En mode démo, les données sont simulées — le branchement réel se fait service par service.</p>
        </div>
      </header>

      <div className="connector-grid">
        {connectors.map((c) => {
          const Brand = BRAND_ICONS[c.id];
          return (
            <button key={c.id} className="connector-card glass" onClick={() => setOpen(c)}>
              <div className="connector-icon">{Brand ? <Brand size={30} /> : null}</div>
              <div className="connector-name">{c.name}</div>
              <div className="connector-tagline">{c.tagline}</div>
              <span className={`pill status-${c.status}`}>{c.status === "demo" ? "Démo" : c.status === "connected" ? "Connecté" : "Disponible"}</span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(null)}>
          <aside className="sheet glass" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn sheet-close" onClick={() => setOpen(null)}>
              <IconClose size={17} />
            </button>
            <div className="sheet-head">
              {(() => {
                const Brand = BRAND_ICONS[open.id];
                return Brand ? <Brand size={36} /> : null;
              })()}
              <div>
                <h2>{open.name}</h2>
                <p>{open.tagline}</p>
              </div>
            </div>
            <div className="sheet-examples">
              {open.examples.map((e) => (
                <span key={e} className="pill">« {e} »</span>
              ))}
            </div>
            <div className="sheet-body">
              {data ? <DataPreview id={open.id} data={data} /> : <p className="muted">Chargement…</p>}
            </div>
            <p className="sheet-foot">Données de démonstration — le branchement réel de {open.name} remplacera ce fournisseur.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
