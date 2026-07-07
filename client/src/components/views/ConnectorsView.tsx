import { useEffect, useRef, useState } from "react";
import { getJSON } from "../../api";
import { useJarvis } from "../../state";
import type { ConnectorInfo } from "../../types";
import { BRAND_ICONS, IconClose } from "../icons";

/**
 * Connecteurs : les ponts de JARVIS vers vos services.
 * Chaque carte se branche en quelques minutes : jeton à coller (Notion,
 * Slack, Figma…) ou autorisation OAuth (Google, Spotify). Tant qu'un
 * service n'est pas branché, ses données sont simulées (mode démo).
 */

type ConnectorPayload = Record<string, unknown>;

async function postConnect<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data;
}

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
              <div className="row-head"><b>{e.start}{e.end ? `–${e.end}` : ""}</b><span>{e.day}</span></div>
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
                <div className="row-head"><b>{p.name}</b><span>{p.duration !== "—" ? p.duration : ""}</span></div>
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

/** Formulaire de branchement : jeton à coller ou autorisation OAuth. */
function ConnectSection({ connector, onChanged }: { connector: ConnectorInfo; onChanged: () => void }) {
  const { auth } = connector;
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingOAuth, setWaitingOAuth] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // pendant l'autorisation OAuth : on guette le retour (fenêtre refermée)
  useEffect(() => {
    if (!waitingOAuth) return;
    pollTimer.current = setInterval(async () => {
      try {
        const r = await getJSON<{ connectors: ConnectorInfo[] }>("/api/connectors");
        if (r.connectors.find((c) => c.id === connector.id)?.status === "connected") {
          setWaitingOAuth(false);
          onChanged();
        }
      } catch {
        /* on réessaie au tick suivant */
      }
    }, 2500);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOAuth]);

  const connectToken = async () => {
    setBusy(true);
    setError(null);
    try {
      await postConnect(`/api/connectors/${connector.id}/credentials`, { token });
      setToken("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await postConnect<{ authorizeUrl: string }>(`/api/connectors/${connector.id}/credentials`, {
        clientId,
        clientSecret,
      });
      window.open(r.authorizeUrl, "_blank", "width=560,height=720");
      setWaitingOAuth(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await postConnect(`/api/connectors/${connector.id}/disconnect`);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (connector.status === "connected") {
    return (
      <div className="connect-box">
        <div className="connect-status ok">
          ● Connecté{connector.account && connector.account !== "clé enregistrée" ? ` — ${connector.account}` : ""}
          {!auth.liveData && <span className="muted"> · clé enregistrée, données encore simulées</span>}
        </div>
        <button className="btn danger" onClick={disconnect} disabled={busy}>
          Déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="connect-box">
      <h3>Se connecter</h3>
      <ol className="connect-steps">
        {auth.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {auth.helpUrl && (
        <a className="connect-help" href={auth.helpUrl} target="_blank" rel="noreferrer">
          Ouvrir la console {connector.name} ↗
        </a>
      )}

      {auth.kind === "token" && (
        <div className="connect-form">
          <input
            type="password"
            placeholder={auth.placeholder ?? "jeton"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && token.trim() && void connectToken()}
          />
          <button className="btn active" onClick={connectToken} disabled={busy || !token.trim()}>
            {busy ? "Vérification…" : "Tester et connecter"}
          </button>
        </div>
      )}

      {auth.kind === "oauth" && (
        <>
          {auth.redirectUri && (
            <div className="redirect-uri">
              <span className="muted">URI de redirection à déclarer :</span>
              <code onClick={() => void navigator.clipboard?.writeText(auth.redirectUri!)} title="Cliquer pour copier">
                {auth.redirectUri}
              </code>
            </div>
          )}
          <div className="connect-form column">
            <input placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <input
              type="password"
              placeholder="Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <button className="btn active" onClick={startOAuth} disabled={busy || !clientId.trim() || !clientSecret.trim()}>
              {busy ? "Préparation…" : "Enregistrer et autoriser"}
            </button>
          </div>
          {waitingOAuth && <div className="connect-status">⟳ Autorisation en cours dans l'autre fenêtre…</div>}
        </>
      )}

      {auth.kind === "local" && <p className="muted">{auth.steps[0]}</p>}

      {error && <div className="connect-status err">✕ {error}</div>}
    </div>
  );
}

export default function ConnectorsView() {
  const connectors = useJarvis((s) => s.connectors);
  const refreshConnectors = useJarvis((s) => s.refreshConnectors);
  const [openId, setOpenId] = useState<string | null>(null);
  // l'aperçu reste lié à sa fiche : pas de données périmées en changeant de carte
  const [preview, setPreview] = useState<{ id: string; payload: ConnectorPayload; live: boolean } | null>(null);

  const open = openId ? connectors.find((c) => c.id === openId) ?? null : null;
  const data = preview && preview.id === openId ? preview.payload : null;
  const live = preview?.id === openId ? preview.live : false;

  const loadData = (id: string) => {
    setPreview(null);
    getJSON<{ data: ConnectorPayload; live: boolean }>(`/api/connectors/${id}`)
      .then((r) => setPreview({ id, payload: r.data, live: r.live }))
      .catch(() => setPreview(null));
  };

  useEffect(() => {
    if (openId) loadData(openId);
  }, [openId]);

  const onChanged = () => {
    void refreshConnectors();
    if (openId) loadData(openId);
  };

  return (
    <div className="view connectors-view">
      <header className="view-head">
        <div>
          <h1>Connecteurs</h1>
          <p>
            Les ponts entre Jarvis et vos services. Cliquez une carte pour la brancher — jeton à coller ou
            autorisation OAuth, la marche à suivre est guidée. Sans branchement, les données sont simulées.
          </p>
        </div>
      </header>

      <div className="connector-grid">
        {connectors.map((c) => {
          const Brand = BRAND_ICONS[c.id];
          return (
            <button key={c.id} className="connector-card glass" onClick={() => setOpenId(c.id)}>
              <div className="connector-icon">{Brand ? <Brand size={30} /> : null}</div>
              <div className="connector-name">{c.name}</div>
              <div className="connector-tagline">{c.tagline}</div>
              <span className={`pill status-${c.status}`}>
                {c.status === "connected" ? "● Connecté" : c.status === "demo" ? "Démo" : "Disponible"}
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpenId(null)}>
          <aside className="sheet glass" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn sheet-close" onClick={() => setOpenId(null)}>
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

            <ConnectSection connector={open} onChanged={onChanged} />

            <div className="sheet-body">
              {data ? <DataPreview id={open.id} data={data} /> : <p className="muted">Chargement…</p>}
            </div>
            <p className="sheet-foot">
              {live
                ? `Données réelles — ${open.name} est branché.`
                : open.status === "connected"
                  ? `Clé enregistrée — les données de ${open.name} restent simulées pour l'instant.`
                  : `Données de démonstration — branchez ${open.name} ci-dessus pour les remplacer.`}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
