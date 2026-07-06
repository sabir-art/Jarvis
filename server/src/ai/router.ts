import { config } from "../config.js";

/**
 * Routeur multi-modèle : JARVIS choisit lui-même le modèle Claude selon la tâche.
 *  - fast     → réponses courtes, questions simples, bavardage
 *  - balanced → cas général
 *  - deep     → code, raisonnement complexe, analyse longue
 * L'utilisateur peut forcer un tier via l'UI ("auto" | "fast" | "balanced" | "deep").
 */

export type ModelTier = "fast" | "balanced" | "deep";

export interface RoutingDecision {
  tier: ModelTier;
  model: string;
  reason: string;
}

const DEEP_HINTS = [
  "code", "coder", "programme", "script", "bug", "debug", "algorithme", "architecture",
  "analyse", "analyser", "démontre", "démonstration", "prouve", "mathémat", "optimis",
  "refactor", "conçois", "conception", "stratégie", "plan détaillé", "approfondi",
  "réfléchis", "raisonne", "compare en détail", "audit", "sécurité",
];

const FAST_HINTS = [
  "bonjour", "salut", "merci", "ok", "oui", "non", "quelle heure", "météo",
  "rappelle-moi", "note que", "ajoute", "coche", "liste", "combien",
];

export function routeModel(message: string, override?: string): RoutingDecision {
  const models: Record<ModelTier, string> = {
    fast: config.models.fast,
    balanced: config.models.balanced,
    deep: config.models.deep,
  };

  if (override && override !== "auto" && override in models) {
    const tier = override as ModelTier;
    return { tier, model: models[tier], reason: "Modèle imposé manuellement." };
  }

  const text = message.toLowerCase();
  const len = message.length;
  const hasCodeBlock = /```|\bfunction\b|\bclass\b|\bimport\b|=>/.test(message);

  let deepScore = 0;
  for (const h of DEEP_HINTS) if (text.includes(h)) deepScore++;
  if (hasCodeBlock) deepScore += 2;
  if (len > 900) deepScore += 2;
  else if (len > 400) deepScore += 1;

  let fastScore = 0;
  for (const h of FAST_HINTS) if (text.includes(h)) fastScore++;
  if (len < 90) fastScore += 1;

  if (deepScore >= 2) {
    return {
      tier: "deep",
      model: models.deep,
      reason: hasCodeBlock
        ? "Code ou raisonnement complexe détecté → modèle le plus puissant."
        : "Tâche d'analyse approfondie détectée → modèle le plus puissant.",
    };
  }
  if (fastScore >= 2 && deepScore === 0) {
    return {
      tier: "fast",
      model: models.fast,
      reason: "Requête courte et simple → modèle instantané, coût minimal.",
    };
  }
  return {
    tier: "balanced",
    model: models.balanced,
    reason: "Tâche standard → modèle équilibré vitesse/qualité.",
  };
}
