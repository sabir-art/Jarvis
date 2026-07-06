import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import type { Database } from "../types.js";

/**
 * Persistance JSON sur disque : zéro dépendance native, démarrage instantané.
 * L'interface (get/save/id) est volontairement minimale pour pouvoir remplacer
 * l'implémentation par SQLite/Postgres + store vectoriel sans toucher au reste.
 */

const EMPTY: Database = {
  nodes: [],
  edges: [],
  messages: [],
  memories: [],
  notes: [],
  tasks: [],
  documents: [],
  proposals: [],
  activity: [],
};

let db: Database | null = null;
let saveTimer: NodeJS.Timeout | null = null;

export function getDb(): Database {
  if (db) return db;
  try {
    const raw = fs.readFileSync(config.dataFile, "utf-8");
    db = { ...EMPTY, ...(JSON.parse(raw) as Partial<Database>) };
  } catch {
    db = structuredClone(EMPTY);
  }
  return db;
}

/** Sauvegarde débouncée (écriture atomique via fichier temporaire). */
export function save(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 250);
}

export function flush(): void {
  if (!db) return;
  const dir = path.dirname(config.dataFile);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = config.dataFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, config.dataFile);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function logActivity(kind: string, message: string): void {
  const d = getDb();
  d.activity.unshift({
    id: newId("act"),
    kind,
    message,
    createdAt: new Date().toISOString(),
  });
  if (d.activity.length > 200) d.activity.length = 200;
  save();
}

process.on("exit", () => flush());
