import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Coffre à identifiants des connecteurs.
 * Les clés sont stockées dans `server/data/connectors.json` — un fichier
 * local, ignoré par git (comme toutes les données), jamais renvoyé au
 * client. Seul un statut (connecté + libellé de compte) est exposé.
 */

export interface ConnectorCreds {
  /** jeton simple (Notion, Slack, Figma…) */
  token?: string;
  /** application OAuth fournie par l'utilisateur */
  clientId?: string;
  clientSecret?: string;
  /** jetons OAuth obtenus après autorisation */
  accessToken?: string;
  refreshToken?: string;
  /** époque (ms) d'expiration de l'accessToken */
  expiresAt?: number;
  /** libellé du compte connecté (e-mail, workspace…) */
  account?: string;
  connectedAt?: string;
}

const FILE = path.resolve(path.dirname(config.dataFile), "connectors.json");

let cache: Record<string, ConnectorCreds> | null = null;

function load(): Record<string, ConnectorCreds> {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf-8")) as Record<string, ConnectorCreds>;
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2));
  fs.renameSync(tmp, FILE);
}

export function getCreds(id: string): ConnectorCreds | undefined {
  return load()[id];
}

export function setCreds(id: string, creds: ConnectorCreds): void {
  load()[id] = { ...load()[id], ...creds };
  persist();
}

export function clearCreds(id: string): void {
  delete load()[id];
  persist();
}

/** Un connecteur est « connecté » dès qu'un jeton utilisable est stocké. */
export function isConnected(id: string): boolean {
  const c = getCreds(id);
  return Boolean(c && (c.token || c.refreshToken || c.accessToken));
}
