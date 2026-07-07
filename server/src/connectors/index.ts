/**
 * Connecteurs : le point d'intégration de JARVIS avec le monde extérieur
 * (mails, agenda, musique, documents, design…).
 *
 * Architecture : chaque connecteur expose un `id`, des métadonnées et un
 * fournisseur de données. Aujourd'hui tous fonctionnent en mode « démo »
 * (données réalistes embarquées, coût nul) ; brancher un vrai service =
 * remplacer le fournisseur par un client MCP/OAuth sans toucher au reste.
 */

export type ConnectorStatus = "demo" | "connected" | "available";

export interface ConnectorInfo {
  id: string;
  name: string;
  tagline: string;
  status: ConnectorStatus;
  /** exemples de phrases à dire à JARVIS */
  examples: string[];
}

export const CONNECTORS: ConnectorInfo[] = [
  { id: "gmail", name: "Gmail", tagline: "Lire et résumer vos e-mails", status: "demo", examples: ["Jarvis, lis mes e-mails", "Ai-je des messages importants ?"] },
  { id: "gcal", name: "Google Agenda", tagline: "Votre emploi du temps, maîtrisé", status: "demo", examples: ["Quel est mon agenda aujourd'hui ?", "Mon prochain rendez-vous ?"] },
  { id: "gdrive", name: "Google Drive", tagline: "Retrouver vos fichiers", status: "demo", examples: ["Cherche le contrat dans mon Drive"] },
  { id: "spotify", name: "Spotify", tagline: "La musique à la voix", status: "demo", examples: ["Jarvis, mets de la musique", "Joue ma playlist Focus"] },
  { id: "notion", name: "Notion", tagline: "Vos pages et bases de connaissance", status: "demo", examples: ["Ouvre mes notes Notion du projet Alpha"] },
  { id: "slack", name: "Slack", tagline: "Le pouls de vos équipes", status: "demo", examples: ["Quoi de neuf sur Slack ?"] },
  { id: "figma", name: "Figma", tagline: "Vos maquettes et design systems", status: "demo", examples: ["Montre les derniers fichiers Figma"] },
  { id: "adobe", name: "Adobe", tagline: "Création et retouche", status: "demo", examples: ["Prépare un visuel pour le post Instagram"] },
  { id: "higgsfield", name: "Higgsfield", tagline: "Génération vidéo & image IA", status: "demo", examples: ["Génère une vidéo d'intro produit"] },
  { id: "runware", name: "Runware", tagline: "Images IA à la demande", status: "demo", examples: ["Génère une image de fusée rétro-futuriste"] },
  { id: "webflow", name: "Webflow", tagline: "Votre site, sans code", status: "demo", examples: ["Combien de pages sur le site Webflow ?"] },
  { id: "chrome", name: "Chrome", tagline: "Navigation et recherche web", status: "demo", examples: ["Rouvre l'article d'hier sur les LLM"] },
];

/* ── Données de démonstration réalistes ────────────────────────── */

export const demoEmails = [
  { from: "Marie Lambert", subject: "Compte-rendu réunion produit", preview: "Bonjour, voici le CR de la réunion de ce matin. Les trois décisions clés : lancement repoussé au 15, budget validé…", time: "09:12", unread: true },
  { from: "GitHub", subject: "PR #42 approuvée : cerveau-galaxie v2", preview: "Votre pull request a été approuvée par 2 relecteurs et peut être fusionnée.", time: "08:47", unread: true },
  { from: "Banque en ligne", subject: "Votre relevé mensuel est disponible", preview: "Le relevé de votre compte au 30 juin est disponible dans votre espace client.", time: "07:30", unread: true },
  { from: "Thomas Chen", subject: "Re: Design de l'orbe", preview: "J'adore la direction minimaliste ! Deux suggestions : accentuer le rim light et réduire le contraste du wordmark…", time: "hier", unread: false },
  { from: "Newsletter IA", subject: "Cette semaine : LLM Wiki, le pattern qui monte", preview: "Karpathy a publié un gist qui fait beaucoup parler : et si votre IA entretenait un wiki au lieu de faire du RAG ?", time: "hier", unread: false },
];

export const demoEvents = [
  { title: "Stand-up équipe", start: "09:30", end: "09:45", where: "Meet", day: "aujourd'hui" },
  { title: "Point design — orbe JARVIS", start: "11:00", end: "12:00", where: "Figma + Meet", day: "aujourd'hui" },
  { title: "Déjeuner avec Thomas", start: "12:30", end: "14:00", where: "Chez Marcel", day: "aujourd'hui" },
  { title: "Revue de sprint", start: "16:00", end: "17:00", where: "Salle Orion", day: "aujourd'hui" },
  { title: "Démo JARVIS aux investisseurs", start: "10:00", end: "11:30", where: "Visio", day: "vendredi" },
];

export const demoTracks = {
  nowPlaying: { title: "Strobe", artist: "deadmau5", album: "For Lack of a Better Name" },
  playlists: [
    { name: "Focus — deep work", tracks: 42, duration: "3 h 12" },
    { name: "Coding at night", tracks: 58, duration: "4 h 05" },
    { name: "Réveil en douceur", tracks: 25, duration: "1 h 34" },
    { name: "Route 66", tracks: 73, duration: "5 h 21" },
  ],
  queue: [
    { title: "Midnight City", artist: "M83" },
    { title: "Innerbloom", artist: "RÜFÜS DU SOL" },
    { title: "An Ending (Ascent)", artist: "Brian Eno" },
  ],
};

export const demoDriveFiles = [
  { name: "Contrat prestation 2026.pdf", kind: "PDF", modified: "il y a 2 j" },
  { name: "Roadmap JARVIS Q3.slides", kind: "Présentation", modified: "il y a 3 j" },
  { name: "Budget prévisionnel.sheet", kind: "Tableur", modified: "la semaine dernière" },
  { name: "Notes entretien candidat dev.doc", kind: "Document", modified: "il y a 2 sem." },
];

export const demoNotionPages = [
  { title: "Projet Alpha — hub", edited: "il y a 1 h", icon: "🚀" },
  { title: "Décisions d'architecture", edited: "hier", icon: "🏛" },
  { title: "Journal de bord produit", edited: "il y a 3 j", icon: "📓" },
  { title: "Base de recettes", edited: "la semaine dernière", icon: "🍝" },
];

export const demoSlackMessages = [
  { channel: "#produit", from: "Marie", text: "Le lancement est confirmé pour le 15 — GO pour la comm' 🎉", time: "10:02" },
  { channel: "#dev", from: "Karim", text: "CI verte sur main, la v2 du cerveau est déployée en staging", time: "09:41" },
  { channel: "#design", from: "Thomas", text: "Nouvelle itération de l'orbe dans Figma, feedback bienvenu", time: "09:15" },
];

export const demoFigmaFiles = [
  { name: "JARVIS — UI minimaliste", edited: "il y a 20 min", pages: 8 },
  { name: "Design System v3", edited: "hier", pages: 24 },
  { name: "Landing page", edited: "il y a 4 j", pages: 5 },
];

export const demoCreative = {
  adobe: [{ name: "Affiche lancement.psd", kind: "Photoshop", modified: "hier" }, { name: "Logo animé.ae", kind: "After Effects", modified: "il y a 3 j" }],
  higgsfield: [{ name: "Intro produit 15 s", kind: "Vidéo IA", status: "rendu terminé" }, { name: "Portrait équipe stylisé", kind: "Image IA", status: "rendu terminé" }],
  runware: [{ name: "Fusée rétro-futuriste", kind: "Image 1024×1024", status: "généré" }, { name: "Icônes app ×6", kind: "Lot d'images", status: "généré" }],
  webflow: { site: "jarvis-app.webflow.io", pages: 12, publishedAt: "il y a 5 j", visits7d: 1842 },
  chrome: [
    { title: "LLM Wiki — gist de Karpathy", url: "gist.github.com/karpathy/…", when: "hier 22:14" },
    { title: "react-three-fiber — docs", url: "r3f.docs.pmnd.rs", when: "hier 21:03" },
    { title: "Web Speech API — MDN", url: "developer.mozilla.org", when: "avant-hier" },
  ],
};

export function connectorData(id: string): unknown {
  switch (id) {
    case "gmail": return { emails: demoEmails };
    case "gcal": return { events: demoEvents };
    case "gdrive": return { files: demoDriveFiles };
    case "spotify": return demoTracks;
    case "notion": return { pages: demoNotionPages };
    case "slack": return { messages: demoSlackMessages };
    case "figma": return { files: demoFigmaFiles };
    case "adobe": return { assets: demoCreative.adobe };
    case "higgsfield": return { jobs: demoCreative.higgsfield };
    case "runware": return { jobs: demoCreative.runware };
    case "webflow": return { site: demoCreative.webflow };
    case "chrome": return { history: demoCreative.chrome };
    default: return null;
  }
}
