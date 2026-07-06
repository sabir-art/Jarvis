import express from "express";
import cors from "cors";
import { config, hasApiKey } from "./config.js";
import { seedBrain } from "./brain/graph.js";
import { api } from "./routes.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // images en base64

app.use("/api", api);

seedBrain();

app.listen(config.port, () => {
  console.log(`◈ JARVIS server — http://localhost:${config.port}`);
  console.log(
    hasApiKey()
      ? "◈ Liaison Anthropic : opérationnelle."
      : "◈ ANTHROPIC_API_KEY absente — mode hors-ligne (copiez .env.example vers .env).",
  );
});
