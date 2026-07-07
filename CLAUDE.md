# CLAUDE.md — mémoire du projet JARVIS

Ce fichier est la mémoire persistante du projet pour Claude. Le lire en
entier avant d'agir. Le tenir à jour à chaque évolution notable.

## Qui est l'utilisateur

- **Sabir** — francophone. Toujours le **vouvoyer** ; JARVIS l'appelle
  « Monsieur » (personnalité majordome, signature « À votre service »,
  « Je veille au grain »).
- Il travaille sur **DEUX machines, en alternance** — ne jamais l'oublier :
  - **Windows** (PowerShell) : projet dans `~\Documents\Jarvis`. Ne jamais
    lui faire ouvrir PowerShell en administrateur (piège System32 déjà
    rencontré). Commandes : `Add-Content`, `Get-Content`, `start spotify:`.
  - **macOS** (Terminal/zsh) : projet dans `~/Documents/Jarvis`.
    Commandes : `echo >> .env`, `open -a Spotify`, `afplay`.
- À chaque changement de machine : `git pull` + parfois `npm install`.
  Son piège récurrent : `git pull` bloqué par un `package-lock.json`
  modifié localement → remède : `git checkout -- package-lock.json` puis
  `git pull`.
- **Ce qui ne voyage PAS entre machines** (local, ignoré par git) :
  - `.env` (clés API) — à recréer sur chaque machine ;
  - `server/data/connectors.json` (branchements Spotify/Google…) — à
    reconnecter sur chaque machine (les URI de redirection déjà déclarées
    chez les fournisseurs servent pour toutes les machines) ;
  - `server/data/jarvis.json` (cerveau/notes/tâches) et `settings.json`
    (voix choisie) — chaque machine a les siens.
- État connu : le **Windows** a `ANTHROPIC_API_KEY` + `ELEVENLABS_API_KEY`
  dans `.env` ; le **Mac** aussi. Spotify a été branché depuis le Mac
  (client ID/secret dans l'app Spotify « SABIR ID », redirect URIs en
  `http://127.0.0.1:3001/...` déjà déclarées).
- Il tient à son budget : **jamais** consommer sa clé Anthropic sans raison.
  Les clés ne se commitent JAMAIS ; lui rappeler de les régénérer si elles
  transitent par la conversation.

## Le projet

Assistant personnel « J.A.R.V.I.S » (style Iron Man) — monorepo npm
workspaces : `server/` (Node 22, Express 5, TS ESM) + `client/` (React 19,
Vite, three.js). Branche de travail : **`claude/jarvis-ai-assistant-du60ox`**
(développer et pousser là, jamais ailleurs). Commits en français.

### Lancer

- `npm run dev` (racine) → serveur :3001 + client :5173 (proxy /api).
- `npm run build` / `npx tsc --noEmit` dans chaque workspace.
- Sans `ANTHROPIC_API_KEY` (ou avec `JARVIS_DEMO=1`) → **mode démo** :
  moteur d'intentions local, zéro consommation. Avec clé → mode Claude
  complet (routeur Haiku/Sonnet/Opus + boucle d'outils).

### Architecture (fichiers clés)

- `server/src/config.ts` — .env, modèles, `isDemoMode()`.
- `server/src/ai/jarvis.ts` — chat SSE (meta/text/tool_*/node_added/ui/done),
  boucle agentique ; route vers `demo/engine.ts` en mode démo.
- `server/src/demo/engine.ts` — compréhension locale : créations (note,
  rappel) par regex PUIS score d'intention tolérant (accents ignorés,
  synonymes, lettres doublées écrasées « alumme »≈« allume », verbe de
  lecture en tête = musique). Réponses par domaine `replyX()`.
- `server/src/connectors/` — `index.ts` (12 connecteurs + données démo),
  `credstore.ts` (clés locales), `auth.ts` (specs par service : jeton testé
  ou OAuth complet avec refresh ; redirect `http://127.0.0.1:PORT/...` —
  exigence Spotify 2025), `live.ts` (données réelles + repli démo ;
  `playOnSpotify` : recherche → lecture, priorité appareil **J.A.R.V.I.S
  intégré > actif > premier**, sinon lance l'app de bureau et re-tente ;
  `controlSpotify`/`spotifyPlayerState` : télécommande universelle).
- `server/src/tts.ts` — voix neuronale : ElevenLabs si clé (défaut
  « Daniel » onwK4e9ZLuTAKqWW03F9), sinon Edge gratuite (défaut Henri) ;
  disjoncteur 60 s ; diagnostic dans `GET /api/health` champ `tts`.
- `server/src/settings.ts` — réglages persistants (voix choisie dans l'UI).
- `server/src/wiki/` — LLM Wiki (ingest/query/lint), coupé en démo.
- `server/src/selfdev/` — compétences proposées par JARVIS, approbation
  humaine obligatoire.
- `client/src/state.ts` — zustand : chat, orbe (idle/listening/thinking/
  speaking), **parole en flux** (`createSpeechStream` : découpe en phrases,
  1re phrase dès ~40 caractères, synthèse pendant la lecture, repli voix
  navigateur, jeton `utteranceSeq` + events `jarvis-tts-start/end`).
- `client/src/voice.ts` — mot d'activation « Jarvis » (variantes garvis/
  djarvis…), suppression pendant TTS/dictée, backoff.
- `client/src/spotify.ts` + `components/SpotifyBar.tsx` — lecteur intégré
  Web Playback SDK (appareil « J.A.R.V.I.S », `activateElement()` au 1er
  geste sinon la lecture DRM s'arrête) ; mini-lecteur : état via
  `GET /api/spotify/player` (source de vérité), commandes via POST
  (play/pause/next/previous/seek/transfer), barre cliquable, progression
  interpolée. **Premium requis** par Spotify pour lecteur intégré et
  télécommande — le dire honnêtement.
- `client/src/components/HomeView.tsx` — cockpit 3 colonnes : gauche
  (HUD heure/météo, pastilles démo/«Jarvis»/voix/avatar/réglages, orbe OU
  repli hologramme, SpotifyBar, statut/tâches/activité), centre (cerveau-
  galaxie), droite (chat). `SettingsSheet.tsx` — choix voix (liste
  ElevenLabs du compte + Edge, extraits écoutables) et modèle IA.
- `client/src/components/Avatar3D.tsx` — avatar VRM (fichier de
  l'utilisateur commité : `client/public/avatar.vrm`, 17 Mo). Variante
  « space » : personnage en pied flottant à gauche du cerveau, mains
  derrière le dos (pose corrigée depuis la T-pose), cadrage automatique
  par os de tête + bounding box ; la galaxie se décale à droite
  (`ViewShift`) pour ne jamais chevaucher.
- `client/src/theme.css` — thème cyan Iron Man (--accent #35e0ff), verre.

### Exigences de l'utilisateur (constantes)

- Perfectionniste : « fais les choses comme il faut ». Jamais de version
  à moitié cassée ; livrer incrémental et fonctionnel.
- **Rien ne doit se chevaucher** dans l'UI (reproché deux fois).
- Compréhension libre : pas de phrase magique ; il fait des fautes de
  frappe (« vasy alumme ») — tolérance obligatoire.
- La voix ne doit pas traîner : parole dès la première phrase.
- Communication honnête : dire ce qui est simulé, ce qui est réel, ce qui
  n'a pas pu être testé en sandbox.

### Méthode de travail éprouvée

1. Implémenter → `tsc --noEmit` + `npm run build`.
2. Tester dans le navigateur : Playwright avec
   `executablePath: /opt/pw-browsers/chromium`, args `--no-sandbox
   --use-gl=swiftshader --enable-unsafe-swiftshader` ; **lire** les
   captures pour vérifier visuellement ; itérer.
3. En sandbox : toujours lancer `JARVIS_DEMO=1 npm run dev` (protéger le
   crédit) ; `pkill` dans une commande SÉPARÉE (exit 144 tue la chaîne).
4. Commit français descriptif + push `claude/jarvis-ai-assistant-du60ox`.
5. Envoyer les captures à l'utilisateur + instructions `git pull` claires
   (différencier Mac/Windows !).

### Contraintes sandbox (environnement Claude)

Le proxy sortant bloque : api.elevenlabs.io, speech.platform.bing.com
(Edge TTS), sdk.scdn.co, api.spotify.com, im.runware.ai… → tester les
replis et la dégradation propre ici, le réel chez l'utilisateur.
npm, api.anthropic.com et open-meteo passent.

### Backlog (évoqué, non fait)

- Actions réelles pour Figma/Webflow/Adobe/Higgsfield/Runware (clés déjà
  stockables, données encore démo — l'UI l'affiche honnêtement).
- Vrais embeddings (le RAG est en TF-IDF), upload PDF.
- Génération d'images (fournisseur à brancher).
- File d'attente / queue Spotify dans le mini-lecteur, volume.
- Historique de conversation persistant côté Claude (le fil UI existe).
