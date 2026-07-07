import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Synthèse vocale neuronale — pour que JARVIS parle comme une vraie voix,
 * pas comme un robot.
 *
 * Fournisseurs, par ordre de préférence :
 *  1. ElevenLabs si ELEVENLABS_API_KEY est défini (le plus naturel) ;
 *  2. Voix neuronales Microsoft Edge — gratuites, sans clé, excellentes
 *     en français (fr-FR-HenriNeural par défaut : masculine, posée) ;
 *  3. À défaut (hors-ligne…), le client retombe sur la voix du navigateur.
 *
 * Réglages (.env) : JARVIS_VOICE (voix Edge), ELEVENLABS_API_KEY,
 * JARVIS_ELEVENLABS_VOICE (id de voix ElevenLabs).
 *
 * Diagnostic : chaque échec est journalisé côté serveur et exposé dans
 * GET /api/health (champ `tts`) — si JARVIS parle « robotique », c'est là
 * qu'on lit pourquoi.
 */

const EDGE_VOICE = process.env.JARVIS_VOICE ?? "fr-FR-HenriNeural";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY ?? "";
// « Daniel » — voix britannique posée, très majordome ; multilingue.
const ELEVEN_VOICE = process.env.JARVIS_ELEVENLABS_VOICE ?? "onwK4e9ZLuTAKqWW03F9";

export interface TtsResult {
  audio: Buffer;
  mime: string;
}

/** État du dernier essai, exposé dans /api/health pour le diagnostic. */
const status = {
  elevenLabsConfigured: ELEVEN_KEY.length > 0,
  edgeVoice: EDGE_VOICE,
  lastProvider: null as string | null,
  lastError: null as string | null,
  lastSuccessAt: null as string | null,
};

export function ttsStatus(): typeof status & { brokenForSeconds: number } {
  return { ...status, brokenForSeconds: Math.max(0, Math.round((brokenUntil - Date.now()) / 1000)) };
}

async function edgeTts(text: string): Promise<TtsResult> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
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

async function elevenLabsTts(text: string): Promise<TtsResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_64`,
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

export async function synthesize(rawText: string): Promise<TtsResult | null> {
  const text = rawText.trim().slice(0, 900);
  if (!text || Date.now() < brokenUntil) return null;

  if (ELEVEN_KEY) {
    try {
      const out = await elevenLabsTts(text);
      status.lastProvider = "elevenlabs";
      status.lastError = null;
      status.lastSuccessAt = new Date().toISOString();
      return out;
    } catch (err) {
      status.lastError = `ElevenLabs : ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`◈ TTS — ${status.lastError} (repli sur la voix Edge)`);
    }
  }

  try {
    const out = await edgeTts(text);
    status.lastProvider = "edge";
    if (!ELEVEN_KEY) status.lastError = null;
    status.lastSuccessAt = new Date().toISOString();
    return out;
  } catch (err) {
    const msg = `Edge TTS : ${err instanceof Error ? err.message : String(err)}`;
    status.lastError = status.lastError ? `${status.lastError} · ${msg}` : msg;
    status.lastProvider = null;
    console.warn(`◈ TTS — ${msg} — repli sur la voix du navigateur pendant 60 s. Détail : GET /api/health (champ tts).`);
    brokenUntil = Date.now() + 60_000;
    return null;
  }
}
