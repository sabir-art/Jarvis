import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getSettings } from "./settings.js";

/**
 * Synthèse vocale neuronale — pour que JARVIS parle comme une vraie voix,
 * pas comme un robot.
 *
 * Fournisseurs, par ordre de préférence :
 *  1. ElevenLabs si ELEVENLABS_API_KEY est défini (le plus naturel) ;
 *  2. Voix neuronales Microsoft Edge — gratuites, sans clé ;
 *  3. À défaut (hors-ligne…), le client retombe sur la voix du navigateur.
 *
 * La voix se choisit dans l'UI (Réglages → Voix) : le choix est persisté
 * dans server/data/settings.json. Les variables d'environnement
 * (JARVIS_VOICE, JARVIS_ELEVENLABS_VOICE) restent les défauts.
 *
 * Diagnostic : chaque échec est journalisé côté serveur et exposé dans
 * GET /api/health (champ `tts`).
 */

const DEFAULT_EDGE_VOICE = process.env.JARVIS_VOICE ?? "fr-FR-HenriNeural";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY ?? "";
// « Daniel » — voix britannique posée, très majordome ; multilingue.
const DEFAULT_ELEVEN_VOICE = process.env.JARVIS_ELEVENLABS_VOICE ?? "onwK4e9ZLuTAKqWW03F9";

export interface TtsResult {
  audio: Buffer;
  mime: string;
}

export interface VoiceRef {
  provider: "elevenlabs" | "edge";
  id: string;
}

/** Voix Edge proposées dans l'UI (gratuites, sans clé). */
export const EDGE_VOICES = [
  { id: "fr-FR-HenriNeural", name: "Henri", hint: "masculine, posée (défaut)" },
  { id: "fr-FR-RemyMultilingualNeural", name: "Rémy", hint: "masculine, jeune, multilingue" },
  { id: "fr-FR-DeniseNeural", name: "Denise", hint: "féminine, claire" },
  { id: "fr-FR-VivienneMultilingualNeural", name: "Vivienne", hint: "féminine, multilingue" },
  { id: "fr-FR-EloiseNeural", name: "Éloïse", hint: "féminine, douce" },
  { id: "fr-CA-AntoineNeural", name: "Antoine", hint: "masculine, québécoise" },
  { id: "en-GB-RyanNeural", name: "Ryan", hint: "anglaise britannique — très J.A.R.V.I.S" },
];

/** Voix effectivement utilisée, selon les réglages UI puis l'environnement. */
export function currentVoice(): VoiceRef {
  const s = getSettings();
  const provider =
    s.ttsProvider && s.ttsProvider !== "auto" ? s.ttsProvider : ELEVEN_KEY ? "elevenlabs" : "edge";
  if (provider === "elevenlabs" && ELEVEN_KEY) {
    return { provider: "elevenlabs", id: s.elevenVoiceId ?? DEFAULT_ELEVEN_VOICE };
  }
  return { provider: "edge", id: s.edgeVoice ?? DEFAULT_EDGE_VOICE };
}

/** État du dernier essai, exposé dans /api/health pour le diagnostic. */
const status = {
  elevenLabsConfigured: ELEVEN_KEY.length > 0,
  lastProvider: null as string | null,
  lastError: null as string | null,
  lastSuccessAt: null as string | null,
};

export function ttsStatus() {
  const s = getSettings();
  return {
    ...status,
    voice: currentVoice(),
    voiceName: s.elevenVoiceName,
    brokenForSeconds: Math.max(0, Math.round((brokenUntil - Date.now()) / 1000)),
  };
}

async function edgeTts(text: string, voiceId: string): Promise<TtsResult> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];
  return await new Promise<TtsResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("délai dépassé (12 s)")), 12_000);
    audioStream.on("data", (c: Buffer) => chunks.push(c));
    audioStream.on("end", () => {
      clearTimeout(timer);
      const audio = Buffer.concat(chunks);
      if (audio.length > 500) resolve({ audio, mime: "audio/mpeg" });
      else reject(new Error(`flux audio vide (${audio.length} octets)`));
    });
    audioStream.on("error", (e: Error) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function elevenLabsTts(text: string, voiceId: string): Promise<TtsResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.55, similarity_boost: 0.75 },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`HTTP ${res.status} — ${detail || "réponse vide"}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length <= 500) throw new Error("audio vide");
    return { audio, mime: "audio/mpeg" };
  } finally {
    clearTimeout(timer);
  }
}

/** Panne récente du fournisseur neuronal : on n'insiste pas pendant 60 s. */
let brokenUntil = 0;

/**
 * Synthétise `text`. Sans `voice`, utilise la voix des réglages ;
 * avec `voice` (aperçu dans l'UI), force cette voix, sans disjoncteur.
 */
export async function synthesize(rawText: string, voice?: VoiceRef): Promise<TtsResult | null> {
  const text = rawText.trim().slice(0, 900);
  if (!text) return null;
  const preview = Boolean(voice);
  if (!preview && Date.now() < brokenUntil) return null;
  const target = voice ?? currentVoice();

  if (target.provider === "elevenlabs" && ELEVEN_KEY) {
    try {
      const out = await elevenLabsTts(text, target.id);
      status.lastProvider = "elevenlabs";
      status.lastError = null;
      status.lastSuccessAt = new Date().toISOString();
      return out;
    } catch (err) {
      status.lastError = `ElevenLabs : ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`◈ TTS — ${status.lastError} (repli sur la voix Edge)`);
      if (preview) return null;
    }
  }

  try {
    const edgeVoice = target.provider === "edge" ? target.id : (getSettings().edgeVoice ?? DEFAULT_EDGE_VOICE);
    const out = await edgeTts(text, edgeVoice);
    status.lastProvider = "edge";
    if (target.provider === "edge") status.lastError = null;
    status.lastSuccessAt = new Date().toISOString();
    return out;
  } catch (err) {
    const msg = `Edge TTS : ${err instanceof Error ? err.message : String(err)}`;
    status.lastError = status.lastError && target.provider === "elevenlabs" ? `${status.lastError} · ${msg}` : msg;
    status.lastProvider = null;
    if (!preview) {
      console.warn(`◈ TTS — ${msg} — repli sur la voix du navigateur pendant 60 s. Détail : GET /api/health (champ tts).`);
      brokenUntil = Date.now() + 60_000;
    }
    return null;
  }
}

export interface ElevenVoice {
  id: string;
  name: string;
  hint: string;
  previewUrl?: string;
}

/** Liste les voix du compte ElevenLabs (voix par défaut + voix ajoutées). */
export async function listElevenLabsVoices(): Promise<ElevenVoice[] | null> {
  if (!ELEVEN_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVEN_KEY },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { voices?: Record<string, unknown>[] };
    return (data.voices ?? []).map((v) => {
      const labels = (v.labels as Record<string, string>) ?? {};
      return {
        id: String(v.voice_id),
        name: String(v.name ?? v.voice_id),
        hint: [labels.gender, labels.accent, labels.age, labels.description ?? labels.use_case]
          .filter(Boolean)
          .join(", "),
        previewUrl: typeof v.preview_url === "string" ? v.preview_url : undefined,
      };
    });
  } catch (err) {
    status.lastError = `ElevenLabs (liste des voix) : ${err instanceof Error ? err.message : String(err)}`;
    return null;
  } finally {
    clearTimeout(timer);
  }
}
