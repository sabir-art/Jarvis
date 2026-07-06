import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

// Charge un éventuel fichier .env (racine du repo ou du serveur) sans dépendance externe.
for (const envPath of [
  path.resolve(serverRoot, "..", ".env"),
  path.resolve(serverRoot, ".env"),
]) {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined && m[2] !== "") {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  dataFile: path.isAbsolute(process.env.JARVIS_DATA_FILE ?? "")
    ? (process.env.JARVIS_DATA_FILE as string)
    : path.resolve(serverRoot, process.env.JARVIS_DATA_FILE ?? "./data/jarvis.json"),
  models: {
    fast: process.env.JARVIS_MODEL_FAST ?? "claude-haiku-4-5",
    balanced: process.env.JARVIS_MODEL_BALANCED ?? "claude-sonnet-5",
    deep: process.env.JARVIS_MODEL_DEEP ?? "claude-opus-4-8",
  },
};

export function hasApiKey(): boolean {
  return config.anthropicApiKey.length > 0;
}
