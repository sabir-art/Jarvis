import express from "express";
import cors from "cors";
import { config, hasApiKey, isDemoMode } from "./config.js";
import { seedBrain, ensureHubs } from "./brain/graph.js";
import { seedDemoContent } from "./demo/seed.js";
import { api } from "./routes.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // images en base64

app.use("/api", api);

seedBrain();
ensureHubs();
if (isDemoMode()) seedDemoContent();

app.listen(config.port, () => {
  console.log(`◈ JARVIS server — http://localhost:${config.port}`);
  console.log(
    hasApiKey()
      ? "◈ Liaison Anthropic : opérationnelle."
      : "◈ Mode démo actif (aucune clé API) : réponses simulées, coût nul. Ajoutez ANTHROPIC_API_KEY dans .env pour le mode complet.",
  );
});
