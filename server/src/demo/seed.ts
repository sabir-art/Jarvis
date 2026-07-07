import { getDb, newId, save, logActivity } from "../db/store.js";
import { addNode } from "../brain/graph.js";
import type { WikiPage } from "../types.js";

/**
 * Contenu de démonstration : un cerveau déjà vécu, pour visualiser JARVIS
 * sans dépenser un centime d'API. Injecté au premier démarrage en mode démo.
 */

const now = () => new Date().toISOString();

const WIKI_PAGES: [slug: string, title: string, content: string][] = [
  [
    "projet-jarvis",
    "Projet JARVIS",
    `# Projet JARVIS

Assistant IA personnel : une orbe minimaliste à qui l'on parle, un cerveau-galaxie qui mémorise tout, et des connecteurs vers vos services (voir [[Connecteurs]]).

## Piliers
- Conversation naturelle, à la voix ou au clavier
- Mémoire persistante et navigable ([[Cerveau-galaxie]])
- Wiki auto-entretenu (pattern LLM Wiki de Karpathy)
- Routeur multi-modèle : Haiku / Sonnet / Opus selon la tâche

## État
Interface v3 minimaliste livrée ; mode démo intégral pour découvrir sans clé API.`,
  ],
  [
    "cerveau-galaxie",
    "Cerveau-galaxie",
    `# Cerveau-galaxie

La signature visuelle de [[Projet JARVIS]] : chaque connaissance est un nœud lumineux dans une galaxie 3D.

## Domaines
Mémoire, Notes, Tâches, Conversations, Recherches, Documents, Compétences, Système, Wiki.

## Interactions
- Molette : zoom sémantique (les étiquettes émergent en plongeant)
- Clic : vol de caméra + fiche du nœud
- Vue Grille pour la lecture organisée`,
  ],
  [
    "connecteurs",
    "Connecteurs",
    `# Connecteurs

Les ponts entre JARVIS et vos services : Gmail, Google Agenda, Drive, Spotify, Notion, Slack, Figma, Adobe, Higgsfield, Runware, Webflow, Chrome.

## Principe
Un connecteur = un module isolé avec la même interface. En mode démo, les données sont simulées ; le branchement réel (OAuth/MCP) remplace le fournisseur sans toucher au reste.

## Exemples de commandes
- « Jarvis, lis mes e-mails »
- « Quel est mon agenda aujourd'hui ? »
- « Mets ma playlist Focus »`,
  ],
  [
    "preferences-utilisateur",
    "Préférences de l'utilisateur",
    `# Préférences de l'utilisateur

## Communication
- Français, réponses concises avec exemples concrets
- Vouvoiement élégant, humour discret

## Goûts connus
- Café (sans sucre) — jamais de thé
- Design minimaliste façon Apple, mode sombre
- Musique électronique pour travailler (voir playlist Focus)

## Rythme
- Deep work le matin, réunions l'après-midi`,
  ],
  [
    "projet-alpha",
    "Projet Alpha",
    `# Projet Alpha

Projet professionnel suivi dans Notion et Slack (#produit).

## Jalons
- ✅ Prototype validé (mai)
- ✅ Budget approuvé
- 🔜 Lancement le 15 du mois — comm' confirmée par Marie

## Personnes
[[Marie Lambert]] (produit), Karim (dev), [[Thomas Chen]] (design).`,
  ],
  [
    "marie-lambert",
    "Marie Lambert",
    `# Marie Lambert

Cheffe de produit sur [[Projet Alpha]].

## À savoir
- Envoie les comptes-rendus le matin même — efficace et directe
- Préfère les décisions tranchées aux longues options
- Contact : e-mail pro (voir Gmail)`,
  ],
  [
    "thomas-chen",
    "Thomas Chen",
    `# Thomas Chen

Designer — travaille sur l'orbe et le design system de [[Projet JARVIS]].

## Style
- Minimalisme assumé, obsession du rim light
- Itère vite dans Figma (fichier « JARVIS — UI minimaliste »)

## Dernier échange
Suggestion d'accentuer la lumière du bord de l'orbe et d'adoucir le wordmark.`,
  ],
  [
    "recette-carbonara",
    "Carbonara (la vraie)",
    `# Carbonara (la vraie)

## Ingrédients (2 pers.)
- 200 g de spaghetti, 100 g de guanciale
- 2 jaunes + 1 œuf entier, 50 g de pecorino, poivre noir

## Règle d'or
Jamais de crème. Le feu éteint avant d'incorporer les œufs, sinon omelette.`,
  ],
];

const NOTES: [title: string, content: string, tags: string[]][] = [
  ["Idées d'articles de blog", "1) L'IA personnelle et la vie privée. 2) Interfaces spatiales : au-delà de l'écran plat. 3) Le pattern LLM Wiki appliqué au quotidien.", ["écriture"]],
  ["Checklist voyage Tokyo", "Passeport ✓ · JR Pass · réservation ryokan · adaptateur type A · eSIM data", ["voyage"]],
  ["Setup bureau", "Écran 32\" 4K, clavier mécanique silencieux, bras articulé, lampe biais 2700K.", ["matériel"]],
  ["Livres en cours", "« Le Problème à trois corps » (ch. 12) — puis « Snow Crash ».", ["lecture"]],
  ["Idée cadeau anniversaire papa", "Coffret dégustation whisky tourbé ou cours de poterie (il en parle depuis Noël).", ["famille"]],
  ["Améliorations orbe", "Rim light plus marqué en haut, halo respirant 4 s, wordmark Quicksand 600.", ["design", "jarvis"]],
];

const MEMORIES: [content: string, category: string][] = [
  ["L'utilisateur préfère les réponses concises avec des exemples concrets.", "préférence"],
  ["L'utilisateur travaille sur le projet JARVIS et le projet Alpha.", "projet"],
  ["L'utilisateur boit du café sans sucre, jamais de thé.", "préférence"],
  ["Thomas Chen est le designer de confiance de l'utilisateur.", "personne"],
  ["L'utilisateur fait du deep work le matin ; éviter de le déranger avant midi.", "contexte"],
  ["Anniversaire du père de l'utilisateur le 22 septembre.", "personne"],
];

const TASKS: [title: string, due?: string][] = [
  ["Préparer la démo investisseurs", "vendredi 10h"],
  ["Relire le compte-rendu de Marie", "aujourd'hui"],
  ["Réserver le restaurant pour samedi", "jeudi"],
  ["Renouveler le passeport", "avant le 30"],
  ["Commander le cadeau de papa", "avant le 15 sept."],
  ["Sauvegarder le NAS", undefined],
];

const DOCUMENTS: [title: string, content: string][] = [
  ["Spécification JARVIS v1", "Architecture modulaire : routeur multi-modèle Claude, boucle agentique à outils, cerveau-graphe persistant, wiki auto-entretenu, connecteurs isolés, auto-développement supervisé par validation humaine."],
  ["CR réunion produit — 4 juillet", "Décisions : lancement Alpha confirmé le 15, budget marketing validé (12 k€), Marie pilote la comm'. Risque identifié : dépendance au prestataire d'hébergement."],
  ["Guide d'onboarding équipe", "Jour 1 : accès (mail, Slack, Notion, Figma). Semaine 1 : pairing quotidien. Conventions : commits conventionnels, revue de code systématique, démo le vendredi."],
];

const CONVERSATION_SAMPLES: [user: string, jarvis: string][] = [
  ["Bonjour Jarvis", "Bonsoir Monsieur. Ravi de vous retrouver. Trois e-mails non lus, quatre rendez-vous aujourd'hui — dont le point design à 11 h. Par quoi commençons-nous ?"],
  ["Mets ma playlist Focus", "C'est parti : « Focus — deep work », 42 titres. Strobe de deadmau5 ouvre le bal. Excellente session, Monsieur."],
  ["Rappelle-moi de relire le CR de Marie", "C'est noté : « Relire le compte-rendu de Marie », pour aujourd'hui. Je l'ai placée en haut de votre liste."],
];

export function seedDemoContent(): void {
  const db = getDb();
  if (db.wikiPages.length > 0 || db.notes.length > 0) return; // déjà peuplé

  for (const [slug, title, content] of WIKI_PAGES) {
    const node = addNode({ type: "wiki", label: title, content, tags: ["wiki"] });
    const page: WikiPage = { id: newId("wiki"), slug, title, content, sources: ["démo"], createdAt: now(), updatedAt: now(), nodeId: node.id };
    db.wikiPages.push(page);
  }
  for (const [title, content, tags] of NOTES) {
    const node = addNode({ type: "note", label: title, content, tags });
    db.notes.push({ id: newId("note"), title, content, tags, createdAt: now(), nodeId: node.id });
  }
  for (const [content, category] of MEMORIES) {
    const node = addNode({ type: "memory", label: content.slice(0, 60), content, tags: [category] });
    db.memories.push({ id: newId("mem"), content, category, createdAt: now(), nodeId: node.id });
  }
  for (const [title, due] of TASKS) {
    const node = addNode({ type: "task", label: title, content: due ? `Échéance : ${due}` : "Sans échéance", tags: ["à faire"] });
    db.tasks.push({ id: newId("task"), title, due, done: false, createdAt: now(), nodeId: node.id });
  }
  for (const [title, content] of DOCUMENTS) {
    const node = addNode({ type: "document", label: title, content, tags: ["indexé"] });
    db.documents.push({ id: newId("doc"), title, content, createdAt: now(), nodeId: node.id });
  }
  addNode({ type: "search", label: "Recherche : LLM Wiki (Karpathy)", content: "Pattern : l'IA entretient un wiki de synthèses au lieu de refaire du RAG à chaque question. Trois opérations : ingest, query, lint.", tags: ["web"] });
  addNode({ type: "search", label: "Recherche : Web Speech API", content: "Reconnaissance vocale native du navigateur (Chrome/Edge). Mode continu possible pour mot d'activation.", tags: ["web"] });

  // Des échanges d'exemple peuplent la galaxie (mais le chat démarre vierge :
  // la première ouverture montre la grande orbe).
  for (const [user, jarvis] of CONVERSATION_SAMPLES) {
    addNode({ type: "conversation", label: user.slice(0, 60), content: `Q : ${user}\n\nR : ${jarvis}`, tags: ["démo"] });
  }

  db.proposals.push({
    id: newId("prop"),
    name: "convertir_unites",
    description: "Convertit des unités courantes (température, distance, poids, devises approximatives).",
    code: `const { valeur, de, vers } = input;
const taux = { "c->f": (v) => v * 9/5 + 32, "km->mi": (v) => v * 0.621371, "kg->lb": (v) => v * 2.20462 };
const fn = taux[\`\${de}->\${vers}\`];
if (!fn) return "Conversion inconnue : " + de + " vers " + vers;
return \`\${valeur} \${de} = \${fn(Number(valeur)).toFixed(2)} \${vers}\`;`,
    inputSchema: { type: "object", properties: { valeur: { type: "number" }, de: { type: "string" }, vers: { type: "string" } }, required: ["valeur", "de", "vers"] },
    rationale: "L'utilisateur demande régulièrement des conversions rapides ; un outil dédié évite un appel modèle.",
    status: "pending",
    createdAt: now(),
    nodeId: addNode({ type: "proposal", label: "Proposition : convertir_unites", content: "Convertit des unités courantes. En attente de validation.", tags: ["auto-dev", "en attente"] }).id,
  });

  logActivity("demo", "Contenu de démonstration injecté : explorez, tout est simulé (coût : 0).");
  logActivity("wiki", `${WIKI_PAGES.length} pages de synthèse rédigées (démo).`);
  logActivity("memory", `${MEMORIES.length} faits mémorisés (démo).`);
  save();
}
