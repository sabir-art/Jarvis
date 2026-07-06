import vm from "node:vm";

/**
 * Bac à sable d'exécution JavaScript (node:vm).
 * ⚠️ node:vm n'est PAS une frontière de sécurité absolue — c'est un garde-fou
 * pour un assistant personnel local et supervisé. Ne pas exposer à des tiers.
 */

function makeContext(logs: string[]): vm.Context {
  return vm.createContext({
    console: {
      log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
      error: (...a: unknown[]) => logs.push("[err] " + a.map(String).join(" ")),
    },
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    structuredClone,
  });
}

/** Exécute du code JS synchrone ; renvoie logs + valeur de la dernière expression. */
export function runJavaScript(code: string): string {
  const logs: string[] = [];
  try {
    const result = vm.runInContext(code, makeContext(logs), { timeout: 2000 });
    const out: string[] = [];
    if (logs.length) out.push(logs.join("\n"));
    if (result !== undefined) out.push(`⇒ ${typeof result === "string" ? result : JSON.stringify(result)}`);
    return out.join("\n") || "(exécuté, aucune sortie)";
  } catch (err) {
    return `Erreur d'exécution : ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Exécute le corps d'une compétence approuvée : `async (input) => { ...code }`. */
export async function runSkillCode(code: string, input: unknown, timeoutMs = 4000): Promise<string> {
  const logs: string[] = [];
  const context = makeContext(logs);
  const script = new vm.Script(`(async (input) => {\n${code}\n})`);
  const fn = script.runInContext(context, { timeout: 1000 }) as (i: unknown) => Promise<unknown>;
  const result = await Promise.race([
    fn(input),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout de la compétence")), timeoutMs)),
  ]);
  const out: string[] = [];
  if (logs.length) out.push(logs.join("\n"));
  if (result !== undefined) out.push(typeof result === "string" ? result : JSON.stringify(result));
  return out.join("\n") || "(compétence exécutée, aucune sortie)";
}
