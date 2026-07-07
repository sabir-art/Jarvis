import { getAccessToken } from "./auth.js";
import { getCreds, isConnected } from "./credstore.js";
import {
  demoEmails,
  demoEvents,
  demoTracks,
  demoDriveFiles,
  demoNotionPages,
  demoSlackMessages,
} from "./index.js";

/**
 * Données réelles des connecteurs.
 * Quand un service est connecté, on interroge son API et on transpose la
 * réponse dans les formes attendues par les popups ; au moindre pépin
 * (réseau, quota, jeton expiré), on retombe sans bruit sur la démo.
 */

async function apiJson(url: string, headers: Record<string, string>, init?: RequestInit): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return {};
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function relativeDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === -1) return "hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ── Gmail ─────────────────────────────────────────────────────── */

async function liveEmails(): Promise<typeof demoEmails> {
  const token = await getAccessToken("gmail");
  if (!token) throw new Error("non connecté");
  const auth = { Authorization: `Bearer ${token}` };
  const list = await apiJson(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&labelIds=INBOX",
    auth,
  );
  const ids = ((list.messages as { id: string }[]) ?? []).slice(0, 5);
  const out = [] as typeof demoEmails;
  for (const { id } of ids) {
    const msg = await apiJson(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      auth,
    );
    const headers = ((msg.payload as { headers?: { name: string; value: string }[] })?.headers ?? []);
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    out.push({
      from: h("from").replace(/\s*<.*>$/, ""),
      subject: h("subject") || "(sans objet)",
      preview: String(msg.snippet ?? ""),
      time: new Date(Number(msg.internalDate ?? Date.now())).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      unread: ((msg.labelIds as string[]) ?? []).includes("UNREAD"),
    });
  }
  if (!out.length) throw new Error("boîte vide");
  return out;
}

/* ── Google Agenda ─────────────────────────────────────────────── */

async function liveEvents(): Promise<typeof demoEvents> {
  const token = await getAccessToken("gcal");
  if (!token) throw new Error("non connecté");
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: "6",
    singleEvents: "true",
    orderBy: "startTime",
  });
  const data = await apiJson(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { Authorization: `Bearer ${token}` },
  );
  const items = (data.items as Record<string, unknown>[]) ?? [];
  const out = items.map((e) => {
    const start = (e.start as { dateTime?: string; date?: string }) ?? {};
    const end = (e.end as { dateTime?: string; date?: string }) ?? {};
    const startIso = start.dateTime ?? `${start.date}T00:00:00`;
    return {
      title: String(e.summary ?? "(sans titre)"),
      start: start.dateTime ? hhmm(start.dateTime) : "journée",
      end: end.dateTime ? hhmm(end.dateTime) : "",
      where: String(e.location ?? (e.hangoutLink ? "Meet" : "")),
      day: relativeDay(startIso),
    };
  });
  if (!out.length) throw new Error("agenda vide");
  return out;
}

/* ── Google Drive ──────────────────────────────────────────────── */

const MIME_KINDS: [RegExp, string][] = [
  [/pdf/, "PDF"],
  [/presentation/, "Présentation"],
  [/spreadsheet/, "Tableur"],
  [/document/, "Document"],
  [/image/, "Image"],
  [/folder/, "Dossier"],
];

async function liveDrive(): Promise<typeof demoDriveFiles> {
  const token = await getAccessToken("gdrive");
  if (!token) throw new Error("non connecté");
  const params = new URLSearchParams({
    pageSize: "6",
    orderBy: "modifiedTime desc",
    fields: "files(name,mimeType,modifiedTime)",
  });
  const data = await apiJson(`https://www.googleapis.com/drive/v3/files?${params}`, {
    Authorization: `Bearer ${token}`,
  });
  const files = (data.files as { name: string; mimeType: string; modifiedTime: string }[]) ?? [];
  const out = files.map((f) => ({
    name: f.name,
    kind: MIME_KINDS.find(([re]) => re.test(f.mimeType))?.[1] ?? "Fichier",
    modified: relativeDay(f.modifiedTime),
  }));
  if (!out.length) throw new Error("drive vide");
  return out;
}

/* ── Spotify ───────────────────────────────────────────────────── */

async function liveTracks(): Promise<typeof demoTracks> {
  const token = await getAccessToken("spotify");
  if (!token) throw new Error("non connecté");
  const auth = { Authorization: `Bearer ${token}` };

  const playlistsData = await apiJson("https://api.spotify.com/v1/me/playlists?limit=6", auth);
  const playlists = ((playlistsData.items as Record<string, unknown>[]) ?? []).map((p) => ({
    name: String(p.name),
    tracks: Number((p.tracks as { total?: number })?.total ?? 0),
    duration: "—",
  }));

  let nowPlaying = { title: "Rien en lecture", artist: "—", album: "" };
  try {
    const np = await apiJson("https://api.spotify.com/v1/me/player/currently-playing", auth);
    const item = np.item as Record<string, unknown> | undefined;
    if (item) {
      nowPlaying = {
        title: String(item.name),
        artist: ((item.artists as { name: string }[]) ?? []).map((a) => a.name).join(", "),
        album: String((item.album as { name?: string })?.name ?? ""),
      };
    }
  } catch {
    /* pas de lecture en cours */
  }

  let queue: { title: string; artist: string }[] = [];
  try {
    const recent = await apiJson("https://api.spotify.com/v1/me/player/recently-played?limit=3", auth);
    queue = ((recent.items as { track: Record<string, unknown> }[]) ?? []).map(({ track }) => ({
      title: String(track.name),
      artist: ((track.artists as { name: string }[]) ?? []).map((a) => a.name).join(", "),
    }));
  } catch {
    /* historique indisponible */
  }

  if (!playlists.length) throw new Error("aucune playlist");
  return { nowPlaying, playlists, queue };
}

/* ── Notion ────────────────────────────────────────────────────── */

async function liveNotionPages(): Promise<typeof demoNotionPages> {
  const token = getCreds("notion")?.token;
  if (!token) throw new Error("non connecté");
  const data = await apiJson(
    "https://api.notion.com/v1/search",
    {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    {
      method: "POST",
      body: JSON.stringify({ page_size: 6, sort: { direction: "descending", timestamp: "last_edited_time" } }),
    },
  );
  const results = (data.results as Record<string, unknown>[]) ?? [];
  const out = results.map((p) => {
    const props = (p.properties as Record<string, { title?: { plain_text: string }[] }>) ?? {};
    const titleProp = Object.values(props).find((v) => Array.isArray(v.title));
    const title =
      titleProp?.title?.map((t) => t.plain_text).join("") ||
      ((p.title as { plain_text: string }[]) ?? []).map((t) => t.plain_text).join("") ||
      "(sans titre)";
    const icon = (p.icon as { emoji?: string })?.emoji ?? "📄";
    return { title, edited: relativeDay(String(p.last_edited_time ?? new Date().toISOString())), icon };
  });
  if (!out.length) throw new Error("aucune page partagée avec l'intégration");
  return out;
}

/* ── Slack ─────────────────────────────────────────────────────── */

async function liveSlackMessages(): Promise<typeof demoSlackMessages> {
  const token = getCreds("slack")?.token;
  if (!token) throw new Error("non connecté");
  const auth = { Authorization: `Bearer ${token}` };
  const chans = await apiJson(
    "https://slack.com/api/conversations.list?limit=8&exclude_archived=true&types=public_channel",
    auth,
  );
  if (!chans.ok) throw new Error("conversations.list refusé");
  const channels = ((chans.channels as Record<string, unknown>[]) ?? []).slice(0, 5);
  const out = channels.map((c) => ({
    channel: `#${String(c.name)}`,
    from: `${Number(c.num_members ?? 0)} membres`,
    text: String((c.topic as { value?: string })?.value || (c.purpose as { value?: string })?.value || "—"),
    time: "",
  }));
  if (!out.length) throw new Error("aucun canal visible");
  return out;
}

/* ── Passerelle : réel si connecté, sinon démo ─────────────────── */

export interface LivePayload<T> {
  data: T;
  /** true si les données proviennent du vrai service */
  live: boolean;
}

async function liveOrDemo<T>(id: string, fetcher: () => Promise<T>, demo: T): Promise<LivePayload<T>> {
  if (!isConnected(id)) return { data: demo, live: false };
  try {
    return { data: await fetcher(), live: true };
  } catch {
    return { data: demo, live: false };
  }
}

export const getEmails = () => liveOrDemo("gmail", liveEmails, demoEmails);
export const getEvents = () => liveOrDemo("gcal", liveEvents, demoEvents);
export const getDriveFiles = () => liveOrDemo("gdrive", liveDrive, demoDriveFiles);
export const getTracks = () => liveOrDemo("spotify", liveTracks, demoTracks);
export const getNotionPages = () => liveOrDemo("notion", liveNotionPages, demoNotionPages);
export const getSlackMessages = () => liveOrDemo("slack", liveSlackMessages, demoSlackMessages);
