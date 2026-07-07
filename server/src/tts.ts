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
 */

const EDGE_VOICE = process.env.JARVIS_VOICE ?? "fr-FR-HenriNeural";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY ?? "";
// « Daniel » — voix britannique posée, très majordome ; multilingue.
const ELEVEN_VOICE = process.env.JARVIS_ELEVENLABS_VOICE ?? "onwK4e9ZLuTAKqWW03F9";

export interface TtsResult {
  audio: Buffer;
  mime: string;
}

async function edgeTts(text: string): Promise<TtsResult | null> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];
  return await new Promise<TtsResult | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 12_000);
    audioStream.on("data", (c: Buffer) => chunks.push(c));
    audioStream.on("end", () => {
      clearTimeout(timer);
      const audio = Buffer.concat(chunks);
      resolve(audio.length > 500 ? { audio, mime: "audio/mpeg" } : null);
    });
    audioStream.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function elevenLabsTts(text: string): Promise<TtsResult | null> {
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
    if (!res.ok) return null;
    const audio = Buffer.from(await res.arrayBuffer());
    return audio.length > 500 ? { audio, mime: "audio/mpeg" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Panne récente du fournisseur neuronal : on n'insiste pas pendant 60 s. */
let brokenUntil = 0;

export async function synthesize(rawText: string): Promise<TtsResult | null> {
  const text = rawText.trim().slice(0, 900);
  if (!text || Date.now() < brokenUntil) return null;
  try {
    const result = ELEVEN_KEY ? ((await elevenLabsTts(text)) ?? (await edgeTts(text))) : await edgeTts(text);
    if (!result) brokenUntil = Date.now() + 60_000;
    return result;
  } catch {
    brokenUntil = Date.now() + 60_000;
    return null;
  }
}
