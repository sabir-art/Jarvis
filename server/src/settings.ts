import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/**
 * Réglages utilisateur persistants (voix, préférences) — un petit JSON
 * local (`server/data/settings.json`), modifiable depuis l'UI.
 * Les variables d'environnement restent les valeurs par défaut.
 */

export interface JarvisSettings {
  /** fournisseur de voix : auto = ElevenLabs si clé, sinon Edge */
  ttsProvider?: "auto" | "elevenlabs" | "edge";
  /** voix ElevenLabs choisie dans l'UI */
  elevenVoiceId?: string;
  elevenVoiceName?: string;
  /** voix Edge choisie dans l'UI */
  edgeVoice?: string;
}

const FILE = path.resolve(path.dirname(config.dataFile), "settings.json");

let cache: JarvisSettings | null = null;

export function getSettings(): JarvisSettings {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf-8")) as JarvisSettings;
  } catch {
    cache = {};
  }
  return cache;
}

export function updateSettings(patch: JarvisSettings): JarvisSettings {
  cache = { ...getSettings(), ...patch };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
  return cache;
}
