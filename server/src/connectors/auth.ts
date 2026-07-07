import crypto from "node:crypto";
import { config } from "../config.js";
import { getCreds, setCreds, type ConnectorCreds } from "./credstore.js";

/**
 * Authentification des connecteurs — trois familles :
 *  - "token"  : coller une clé/un jeton (Notion, Slack, Figma, Webflow…) ;
 *  - "oauth"  : autorisation OAuth 2 (Google, Spotify) — l'utilisateur crée
 *    une app chez le fournisseur, colle client ID + secret, puis autorise ;
 *  - "local"  : rien à configurer (fonctionnalité navigateur, à venir).
 * Chaque spécification embarque les étapes exactes, en français, affichées
 * dans le panneau « Connecter » du client.
 */

export type AuthKind = "token" | "oauth" | "local";

export interface AuthSpec {
  kind: AuthKind;
  /** libellé du champ à coller ("Jeton d'intégration"…) */
  label?: string;
  placeholder?: string;
  /** URL directe où créer la clé / l'app */
  helpUrl?: string;
  /** étapes numérotées affichées à l'utilisateur */
  steps: string[];
  /** ce connecteur sert-il de vraies données une fois connecté ? */
  liveData: boolean;
  /* — OAuth — */
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
}

export function redirectUri(id: string): string {
  return `http://localhost:${config.port}/api/connectors/${id}/callback`;
}

const GOOGLE_STEPS = (api: string, scope: string) => [
  `Ouvrez console.cloud.google.com et créez (ou choisissez) un projet.`,
  `« API et services » → « Bibliothèque » : activez l'API ${api}.`,
  `« Écran de consentement OAuth » : type Externe, ajoutez votre e-mail comme utilisateur test.`,
  `« Identifiants » → « Créer des identifiants » → « ID client OAuth » → type Application Web.`,
  `Ajoutez l'URI de redirection exacte affichée ci-dessous, puis copiez le client ID et le secret ici.`,
  `Cliquez « Autoriser » : Google ouvre l'écran de consentement (${scope}).`,
];

export const AUTH_SPECS: Record<string, AuthSpec> = {
  gmail: {
    kind: "oauth",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    steps: GOOGLE_STEPS("Gmail", "lecture seule de votre boîte"),
    liveData: true,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  },
  gcal: {
    kind: "oauth",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    steps: GOOGLE_STEPS("Google Calendar", "lecture seule de votre agenda"),
    liveData: true,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  },
  gdrive: {
    kind: "oauth",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    steps: GOOGLE_STEPS("Google Drive", "métadonnées de vos fichiers"),
    liveData: true,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
  },
  spotify: {
    kind: "oauth",
    helpUrl: "https://developer.spotify.com/dashboard",
    steps: [
      "Ouvrez developer.spotify.com/dashboard et créez une app (gratuit).",
      "Dans les réglages de l'app, ajoutez l'URI de redirection exacte affichée ci-dessous.",
      "Copiez le Client ID et le Client Secret ici.",
      "Cliquez « Autoriser » : Spotify ouvre l'écran de consentement.",
    ],
    liveData: true,
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scopes: [
      "playlist-read-private",
      "user-read-recently-played",
      "user-read-playback-state",
    ],
  },
  notion: {
    kind: "token",
    label: "Jeton d'intégration interne",
    placeholder: "ntn_… ou secret_…",
    helpUrl: "https://www.notion.so/my-integrations",
    steps: [
      "Ouvrez notion.so/my-integrations et créez une « intégration interne ».",
      "Copiez le jeton secret et collez-le ici.",
      "Dans Notion, partagez les pages voulues avec l'intégration (menu ··· → Connexions).",
    ],
    liveData: true,
  },
  slack: {
    kind: "token",
    label: "Bot User OAuth Token",
    placeholder: "xoxb-…",
    helpUrl: "https://api.slack.com/apps",
    steps: [
      "Ouvrez api.slack.com/apps et créez une app (From scratch) dans votre workspace.",
      "« OAuth & Permissions » : ajoutez les scopes channels:read et channels:history.",
      "Cliquez « Install to Workspace », puis copiez le Bot User OAuth Token (xoxb-…).",
    ],
    liveData: true,
  },
  figma: {
    kind: "token",
    label: "Jeton d'accès personnel",
    placeholder: "figd_…",
    helpUrl: "https://www.figma.com/developers/api#access-tokens",
    steps: [
      "Dans Figma : avatar → Settings → onglet Security.",
      "« Personal access tokens » : générez un jeton et collez-le ici.",
    ],
    liveData: false,
  },
  webflow: {
    kind: "token",
    label: "Jeton d'API du site",
    placeholder: "Bearer token",
    helpUrl: "https://developers.webflow.com/data/reference/site-token",
    steps: [
      "Dans Webflow : Site settings → Apps & integrations.",
      "« API access » : générez un jeton et collez-le ici.",
    ],
    liveData: false,
  },
  adobe: {
    kind: "token",
    label: "Clé d'API Adobe",
    placeholder: "clé du projet Adobe Developer Console",
    helpUrl: "https://developer.adobe.com/console",
    steps: [
      "Ouvrez developer.adobe.com/console et créez un projet.",
      "Ajoutez l'API voulue (Photoshop, Firefly…), générez les identifiants et collez la clé ici.",
    ],
    liveData: false,
  },
  higgsfield: {
    kind: "token",
    label: "Clé d'API Higgsfield",
    placeholder: "hf_…",
    helpUrl: "https://higgsfield.ai",
    steps: ["Dans votre compte Higgsfield, ouvrez les réglages API, générez une clé et collez-la ici."],
    liveData: false,
  },
  runware: {
    kind: "token",
    label: "Clé d'API Runware",
    placeholder: "clé API",
    helpUrl: "https://my.runware.ai/keys",
    steps: ["Ouvrez my.runware.ai/keys, créez une clé d'API et collez-la ici."],
    liveData: false,
  },
  chrome: {
    kind: "local",
    steps: [
      "Rien à configurer : ce connecteur s'appuiera sur votre navigateur (extension à venir).",
    ],
    liveData: false,
  },
};

/* ── Test des jetons simples ───────────────────────────────────── */

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vérifie un jeton auprès du service et renvoie le libellé du compte.
 * Les services sans point de test connu sont acceptés sans vérification.
 */
export async function testToken(id: string, token: string): Promise<{ account: string; verified: boolean }> {
  switch (id) {
    case "notion": {
      const r = await fetchJson("https://api.notion.com/v1/users/me", {
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
      });
      if (!r.ok) throw new Error("Jeton Notion refusé — vérifiez-le et réessayez.");
      return { account: String(r.body.name ?? "intégration Notion"), verified: true };
    }
    case "slack": {
      const r = await fetchJson("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok || !r.body.ok) throw new Error("Jeton Slack refusé — vérifiez le Bot Token (xoxb-…).");
      return { account: String(r.body.team ?? "workspace Slack"), verified: true };
    }
    case "figma": {
      const r = await fetchJson("https://api.figma.com/v1/me", {
        headers: { "X-Figma-Token": token },
      });
      if (!r.ok) throw new Error("Jeton Figma refusé — vérifiez le jeton personnel (figd_…).");
      return { account: String(r.body.email ?? "compte Figma"), verified: true };
    }
    case "webflow": {
      const r = await fetchJson("https://api.webflow.com/v2/token/authorized_by", {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (!r.ok) throw new Error("Jeton Webflow refusé — vérifiez le jeton d'API du site.");
      return { account: String(r.body.email ?? "compte Webflow"), verified: true };
    }
    default:
      // pas de point de test public fiable : on enregistre sans vérifier
      return { account: "clé enregistrée", verified: false };
  }
}

/* ── OAuth 2 (code d'autorisation) ─────────────────────────────── */

/** anti-CSRF : états en attente, valables 10 minutes */
const pendingStates = new Map<string, { id: string; expires: number }>();

export function buildAuthorizeUrl(id: string): string {
  const spec = AUTH_SPECS[id];
  const creds = getCreds(id);
  if (!spec?.authUrl || !spec.scopes) throw new Error("Ce connecteur n'utilise pas OAuth.");
  if (!creds?.clientId) throw new Error("Enregistrez d'abord le client ID et le secret.");
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { id, expires: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    redirect_uri: redirectUri(id),
    scope: spec.scopes.join(" "),
    state,
  });
  // Google : refresh token uniquement avec access_type=offline + consentement
  if (spec.authUrl.includes("google")) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }
  return `${spec.authUrl}?${params.toString()}`;
}

export async function handleOAuthCallback(id: string, code: string, state: string): Promise<void> {
  const pending = pendingStates.get(state);
  if (!pending || pending.id !== id || pending.expires < Date.now()) {
    throw new Error("État OAuth invalide ou expiré — relancez l'autorisation.");
  }
  pendingStates.delete(state);
  const spec = AUTH_SPECS[id];
  const creds = getCreds(id);
  if (!spec?.tokenUrl || !creds?.clientId || !creds.clientSecret) throw new Error("Configuration OAuth incomplète.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(id),
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  const r = await fetchJson(spec.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok || typeof r.body.access_token !== "string") {
    throw new Error(`Échange de code refusé (${r.status}) : ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  setCreds(id, {
    accessToken: r.body.access_token as string,
    refreshToken: (r.body.refresh_token as string | undefined) ?? creds.refreshToken,
    expiresAt: Date.now() + Number(r.body.expires_in ?? 3600) * 1000,
    account: "compte autorisé",
    connectedAt: new Date().toISOString(),
  });
}

/** Renvoie un accessToken valide (rafraîchi si besoin) ou null. */
export async function getAccessToken(id: string): Promise<string | null> {
  const spec = AUTH_SPECS[id];
  const creds = getCreds(id);
  if (!creds) return null;
  if (creds.accessToken && (creds.expiresAt ?? 0) > Date.now() + 60_000) return creds.accessToken;
  if (!creds.refreshToken || !spec?.tokenUrl || !creds.clientId || !creds.clientSecret) {
    return creds.accessToken ?? null;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  try {
    const r = await fetchJson(spec.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!r.ok || typeof r.body.access_token !== "string") return null;
    const update: ConnectorCreds = {
      accessToken: r.body.access_token as string,
      expiresAt: Date.now() + Number(r.body.expires_in ?? 3600) * 1000,
    };
    if (typeof r.body.refresh_token === "string") update.refreshToken = r.body.refresh_token;
    setCreds(id, update);
    return update.accessToken ?? null;
  } catch {
    return null;
  }
}
