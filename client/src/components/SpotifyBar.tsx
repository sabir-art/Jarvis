import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../api";
import { useJarvis } from "../state";
import { IconPlay } from "./icons";

/**
 * Mini-lecteur Spotify du cockpit — fiable quel que soit l'appareil :
 * l'état vient de l'API Spotify (source de vérité), les commandes passent
 * par le serveur (télécommande universelle : page J.A.R.V.I.S, app de
 * bureau, téléphone). La progression est interpolée localement entre deux
 * synchronisations, et la barre est cliquable (avance/recul).
 */

interface Snapshot {
  connected: boolean;
  playing: boolean;
  progressMs: number;
  durationMs: number;
  track: { title: string; artist: string; artwork?: string } | null;
  device: { id: string; name: string } | null;
}

const POLL_MS = 3500;

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SpotifyBar() {
  const sdk = useJarvis((s) => s.spotifyPlayer); // événements du lecteur intégré
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const lastSync = useRef({ at: 0, ms: 0, playing: false });
  const barRef = useRef<HTMLDivElement>(null);

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

  const control = async (action: string, extra: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      await postJSON("/api/spotify/player", { action, ...extra });
      await sync();
    } catch {
      await sync(); // même en échec : on réaffiche la réalité
    } finally {
      setBusy(false);
    }
  };

  const onSeek = (e: React.MouseEvent) => {
    if (!barRef.current || !snap?.durationMs) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const positionMs = Math.round(ratio * snap.durationMs);
    setProgress(positionMs); // retour visuel immédiat
    lastSync.current = { at: Date.now(), ms: positionMs, playing: lastSync.current.playing };
    void control("seek", { positionMs });
  };

  /* rien à afficher : Spotify non branché, et lecteur intégré absent */
  if (!snap?.connected && !sdk.ready) return null;
  if (sdk.unavailable && !snap?.track) return null;

  const track = snap?.track ?? sdk.track;
  const playing = snap?.playing ?? !sdk.paused;
  const playsHere = snap?.device && sdk.deviceId ? snap.device.id === sdk.deviceId : false;

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
          <button className="icon-btn" title="Précédent" disabled={busy || !track} onClick={() => void control("previous")}>
            ⏮
          </button>
          <button
            className="icon-btn sp-play"
            title={playing ? "Pause" : "Lecture"}
            disabled={busy}
            onClick={() =>
              void control(playing ? "pause" : "play", !track && sdk.deviceId ? { deviceId: sdk.deviceId } : {})
            }
          >
            {playing ? "⏸" : <IconPlay size={15} />}
          </button>
          <button className="icon-btn" title="Suivant" disabled={busy || !track} onClick={() => void control("next")}>
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

      {snap?.track && sdk.ready && !playsHere && (
        <button className="sp-transfer" onClick={() => void control("transfer", { deviceId: sdk.deviceId })}>
          ↪ Rapatrier la lecture ici
        </button>
      )}
      {sdk.unavailable && <div className="sp-note">{sdk.unavailable}</div>}
    </section>
  );
}
