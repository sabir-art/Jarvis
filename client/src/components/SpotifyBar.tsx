import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "../api";
import { useJarvis } from "../state";
import { playerControls } from "../spotify";
import { IconPlay } from "./icons";

/**
 * Mini-lecteur Spotify du cockpit.
 * Fiabilité avant tout :
 *  - quand la musique joue DANS le lecteur intégré, les boutons pilotent le
 *    SDK local (instantané) ; sinon, l'API Spotify (télécommande
 *    universelle : app de bureau, téléphone…) ;
 *  - toute commande refusée AFFICHE sa raison — jamais d'échec silencieux ;
 *  - resynchronisation immédiate puis différée (Spotify met parfois une
 *    seconde à reconnaître un changement de piste) ;
 *  - barre de progression cliquable, volume, minutages.
 */

interface Snapshot {
  connected: boolean;
  playing: boolean;
  progressMs: number;
  durationMs: number;
  track: { title: string; artist: string; artwork?: string } | null;
  device: { id: string; name: string } | null;
  volumePercent: number | null;
  queue: { title: string; artist: string }[];
}

const POLL_MS = 3500;

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** POST qui remonte le message d'erreur du serveur (pas un échec muet). */
async function postControl(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/spotify/player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `erreur ${res.status}`);
  }
}

export default function SpotifyBar() {
  const sdk = useJarvis((s) => s.spotifyPlayer); // lecteur intégré (événements)
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastSync = useRef({ at: 0, ms: 0, playing: false });
  const barRef = useRef<HTMLDivElement>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = (msg: string) => {
    setError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(null), 5000);
  };

  const sync = useCallback(async () => {
    try {
      const s = await getJSON<Snapshot>("/api/spotify/player");
      setSnap(s);
      lastSync.current = { at: Date.now(), ms: s.progressMs, playing: s.playing };
      setProgress(s.progressMs);
    } catch {
      /* serveur muet : on garde l'état précédent */
    }
  }, []);

  /* synchronisation périodique (onglet visible uniquement) */
  useEffect(() => {
    void sync();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [sync]);

  /* le lecteur intégré pousse ses événements : resynchronisation immédiate */
  useEffect(() => {
    void sync();
  }, [sdk.track?.title, sdk.paused, sdk.ready, sync]);

  /* progression interpolée entre deux synchronisations */
  useEffect(() => {
    const timer = setInterval(() => {
      const ls = lastSync.current;
      if (!ls.playing || !snap?.durationMs) return;
      setProgress(Math.min(ls.ms + (Date.now() - ls.at), snap.durationMs));
    }, 250);
    return () => clearInterval(timer);
  }, [snap?.durationMs]);

  const playsHere = Boolean(snap?.device && sdk.deviceId && snap.device.id === sdk.deviceId);

  /** Resynchronise tout de suite, puis après le délai de propagation Spotify. */
  const resync = () => {
    void sync();
    setTimeout(() => void sync(), 1200);
  };

  /**
   * Commande : SDK local si la lecture est ici (instantané, fiable),
   * sinon API Spotify. Échec → raison affichée.
   */
  const control = async (action: "toggle" | "next" | "previous") => {
    setError(null);
    try {
      if (playsHere) {
        const viaSdk =
          action === "toggle" ? playerControls.toggle() : action === "next" ? playerControls.next() : playerControls.previous();
        if (viaSdk) {
          await viaSdk;
          resync();
          return;
        }
      }
      const apiAction = action === "toggle" ? (snap?.playing ? "pause" : "play") : action;
      const extra = action === "toggle" && !snap?.playing && !snap?.track && sdk.deviceId ? { deviceId: sdk.deviceId } : {};
      await postControl({ action: apiAction, ...extra });
      resync();
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
      resync();
    }
  };

  const onSeek = (e: React.MouseEvent) => {
    if (!barRef.current || !snap?.durationMs) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const positionMs = Math.round(ratio * snap.durationMs);
    setProgress(positionMs); // retour visuel immédiat
    lastSync.current = { at: Date.now(), ms: positionMs, playing: lastSync.current.playing };
    postControl({ action: "seek", positionMs }).then(resync, (e2) => showError(String(e2 instanceof Error ? e2.message : e2)));
  };

  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const onVolume = (value: number) => {
    setVolumeDraft(value); // retour visuel immédiat
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => {
      postControl({ action: "volume", volumePercent: value }).then(
        () => {
          setVolumeDraft(null);
          resync();
        },
        (e) => {
          setVolumeDraft(null);
          showError(String(e instanceof Error ? e.message : e));
        },
      );
    }, 250);
  };

  /* rien à afficher : Spotify non branché, et lecteur intégré absent */
  if (!snap?.connected && !sdk.ready) return null;
  if (sdk.unavailable && !snap?.track) return null;

  const track = snap?.track ?? sdk.track;
  const playing = snap?.playing ?? !sdk.paused;
  const volume = volumeDraft ?? snap?.volumePercent ?? null;

  return (
    <section className="glass card mini spotify-bar" title={snap?.device ? `Lecture sur ${snap.device.name}` : undefined}>
      <div className="sp-row">
        {track?.artwork ? (
          <img className="sp-art" src={track.artwork} alt="" />
        ) : (
          <div className="sp-art placeholder">♪</div>
        )}
        <div className="sp-meta">
          <div className="sp-title">{track?.title ?? "Lecteur J.A.R.V.I.S prêt"}</div>
          <div className="sp-artist">
            {track ? track.artist : "demandez un morceau"}
            {snap?.device && track && !playsHere && <span className="sp-device"> · {snap.device.name}</span>}
          </div>
        </div>
        <div className="sp-controls">
          <button className="icon-btn" title="Précédent" disabled={!track} onClick={() => void control("previous")}>
            ⏮
          </button>
          <button className="icon-btn sp-play" title={playing ? "Pause" : "Lecture"} onClick={() => void control("toggle")}>
            {playing ? "⏸" : <IconPlay size={15} />}
          </button>
          <button className="icon-btn" title="Suivant" disabled={!track} onClick={() => void control("next")}>
            ⏭
          </button>
        </div>
      </div>

      {track && snap && snap.durationMs > 0 && (
        <div className="sp-progress">
          <span className="sp-time">{fmt(progress)}</span>
          <div className="sp-bar" ref={barRef} onClick={onSeek} title="Cliquer pour se déplacer">
            <div className="sp-fill" style={{ width: `${Math.min(100, (progress / snap.durationMs) * 100)}%` }} />
          </div>
          <span className="sp-time">{fmt(snap.durationMs)}</span>
        </div>
      )}

      {volume !== null && track && (
        <div className="sp-volume">
          <span className="sp-vol-ico">{volume === 0 ? "🔇" : "🔉"}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            title={`Volume : ${volume} %`}
          />
        </div>
      )}

      {track && snap && snap.queue.length > 0 && (
        <div className="sp-queue" title={snap.queue.map((q) => `${q.title} — ${q.artist}`).join("\n")}>
          À suivre : <b>{snap.queue[0].title}</b> — {snap.queue[0].artist}
          {snap.queue.length > 1 && <span className="muted"> +{snap.queue.length - 1}</span>}
        </div>
      )}

      {snap?.track && sdk.ready && !playsHere && (
        <button
          className="sp-transfer"
          onClick={() => postControl({ action: "transfer", deviceId: sdk.deviceId }).then(resync, (e) => showError(String(e instanceof Error ? e.message : e)))}
        >
          ↪ Rapatrier la lecture ici
        </button>
      )}
      {error && <div className="sp-note">✕ {error}</div>}
      {sdk.unavailable && !error && <div className="sp-note">{sdk.unavailable}</div>}
    </section>
  );
}
