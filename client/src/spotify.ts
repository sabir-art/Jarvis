/**
 * Lecteur Spotify intégré — la page JARVIS devient un appareil Spotify
 * (Web Playback SDK). Plus besoin d'ouvrir l'application : JARVIS trouve
 * le morceau et le joue ici même.
 *
 * Conditions (imposées par Spotify) : connecteur Spotify branché avec le
 * droit « streaming » (bouton Ré-autoriser après mise à jour) et compte
 * Premium. À défaut, on retombe sans bruit sur les appareils classiques.
 */

export interface PlayerTrack {
  title: string;
  artist: string;
  artwork?: string;
}

export interface PlayerState {
  ready: boolean;
  deviceId: string | null;
  track: PlayerTrack | null;
  paused: boolean;
  /** raison d'indisponibilité (compte non Premium…) */
  unavailable?: string;
}

/* Typage minimal du SDK (chargé dynamiquement depuis sdk.scdn.co). */
interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: never) => void): void;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
  }
}

let player: SdkPlayer | null = null;
let started = false;

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/connectors/spotify/token");
    if (!res.ok || res.status === 204) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

function loadSdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve(true);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve(true);
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
    // hors-ligne / bloqué : ne pas attendre indéfiniment
    setTimeout(() => resolve(Boolean(window.Spotify)), 10_000);
  });
}

/**
 * Démarre le lecteur intégré (idempotent). `onState` reçoit chaque
 * évolution : prêt, morceau en cours, pause, indisponibilité.
 */
export async function startSpotifyPlayer(onState: (s: Partial<PlayerState>) => void): Promise<void> {
  if (started) return;
  started = true;

  const token = await fetchToken();
  if (!token) {
    started = false; // pas branché : on retentera à la prochaine connexion
    return;
  }
  if (!(await loadSdk()) || !window.Spotify) {
    onState({ unavailable: "SDK Spotify injoignable" });
    return;
  }

  player = new window.Spotify.Player({
    name: "J.A.R.V.I.S",
    getOAuthToken: (cb) => {
      void fetchToken().then((t) => t && cb(t));
    },
    volume: 0.8,
  });

  player.addListener("ready", (data: { device_id: string }) => {
    onState({ ready: true, deviceId: data.device_id, unavailable: undefined });
  });
  player.addListener("not_ready", () => onState({ ready: false }));
  player.addListener("account_error", () => {
    onState({ ready: false, unavailable: "compte Spotify non Premium — lecteur intégré indisponible" });
  });
  player.addListener("initialization_error", () => onState({ ready: false, unavailable: "lecteur non supporté ici" }));
  player.addListener("authentication_error", () => onState({ ready: false, unavailable: "ré-autorisation Spotify requise" }));
  player.addListener(
    "player_state_changed",
    (state: {
      paused: boolean;
      track_window?: { current_track?: { name: string; artists: { name: string }[]; album?: { images?: { url: string }[] } } };
    } | null) => {
      if (!state) return;
      const t = state.track_window?.current_track;
      onState({
        paused: state.paused,
        track: t
          ? {
              title: t.name,
              artist: (t.artists ?? []).map((a) => a.name).join(", "),
              artwork: t.album?.images?.[0]?.url,
            }
          : null,
      });
    },
  );

  await player.connect();
}

export const playerControls = {
  toggle: () => player?.togglePlay(),
  next: () => player?.nextTrack(),
  previous: () => player?.previousTrack(),
};
