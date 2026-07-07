import { useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../api";
import { useJarvis } from "../state";
import type { ModelChoice } from "../types";
import { IconClose, IconPlay } from "./icons";

/**
 * Réglages de JARVIS :
 *  - Voix — toutes les voix de votre compte ElevenLabs (avec écoute d'un
 *    extrait) et les voix neuronales Edge gratuites ; un clic pour choisir,
 *    le choix est persisté côté serveur.
 *  - Modèle IA — routage automatique ou modèle Claude forcé.
 */

interface Voice {
  id: string;
  name: string;
  hint: string;
  previewUrl?: string;
}

interface VoicesPayload {
  elevenlabs: Voice[] | null;
  edge: Voice[];
  current: { provider: "elevenlabs" | "edge"; id: string };
}

interface ModelTier {
  tier: string;
  model: string;
  label: string;
}

const PREVIEW_TEXT = "Mes salutations, Monsieur. À votre service.";

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const modelChoice = useJarvis((s) => s.modelChoice);
  const setModelChoice = useJarvis((s) => s.setModelChoice);
  const demoMode = useJarvis((s) => s.demoMode);

  const [voices, setVoices] = useState<VoicesPayload | null>(null);
  const [voicesError, setVoicesError] = useState(false);
  const [models, setModels] = useState<ModelTier[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    getJSON<VoicesPayload>("/api/tts/voices")
      .then(setVoices)
      .catch(() => setVoicesError(true));
    getJSON<{ tiers: ModelTier[] }>("/api/models")
      .then((r) => setModels(r.tiers))
      .catch(() => setModels([]));
    return () => audioRef.current?.pause();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  };

  /** Écoute d'un extrait : preview_url ElevenLabs, ou synthèse serveur. */
  const preview = async (provider: "elevenlabs" | "edge", v: Voice) => {
    if (playing === v.id) {
      stopPreview();
      return;
    }
    stopPreview();
    setPlaying(v.id);
    try {
      let url = v.previewUrl;
      if (!url) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: PREVIEW_TEXT, voice: { provider, id: v.id } }),
        });
        if (!res.ok || res.status === 204) throw new Error("aperçu indisponible");
        url = URL.createObjectURL(await res.blob());
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying((p) => (p === v.id ? null : p));
      audio.onerror = () => setPlaying((p) => (p === v.id ? null : p));
      await audio.play();
    } catch {
      setPlaying((p) => (p === v.id ? null : p));
    }
  };

  const choose = async (provider: "elevenlabs" | "edge", v: Voice) => {
    setSaving(v.id);
    try {
      await postJSON("/api/tts/voice", { provider, id: v.id, name: v.name });
      setVoices((cur) => (cur ? { ...cur, current: { provider, id: v.id } } : cur));
    } finally {
      setSaving(null);
    }
  };

  const VoiceList = ({ provider, list }: { provider: "elevenlabs" | "edge"; list: Voice[] }) => (
    <ul className="voice-list">
      {list.map((v) => {
        const active = voices?.current.provider === provider && voices.current.id === v.id;
        return (
          <li key={v.id} className={active ? "active" : ""}>
            <button
              className={`icon-btn play ${playing === v.id ? "active" : ""}`}
              title="Écouter un extrait"
              onClick={() => void preview(provider, v)}
            >
              <IconPlay size={15} />
            </button>
            <div className="voice-meta" onClick={() => void choose(provider, v)}>
              <div className="voice-name">{v.name}</div>
              {v.hint && <div className="voice-hint">{v.hint}</div>}
            </div>
            <button className={`btn ${active ? "active" : ""}`} disabled={saving === v.id} onClick={() => void choose(provider, v)}>
              {active ? "✓ Utilisée" : saving === v.id ? "…" : "Choisir"}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet glass settings-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sheet-close" onClick={onClose}>
          <IconClose size={17} />
        </button>
        <div className="sheet-head">
          <div>
            <h2>Réglages</h2>
            <p>La voix de JARVIS et le modèle qui pense pour vous.</p>
          </div>
        </div>

        <section className="settings-section">
          <h3>Voix</h3>
          {!voices && !voicesError && <p className="muted">Chargement des voix…</p>}
          {voicesError && <p className="muted">Voix injoignables — le serveur est-il démarré ?</p>}

          {voices?.elevenlabs && voices.elevenlabs.length > 0 && (
            <>
              <div className="settings-sub">ElevenLabs — votre compte ({voices.elevenlabs.length} voix)</div>
              <VoiceList provider="elevenlabs" list={voices.elevenlabs} />
            </>
          )}
          {voices && !voices.elevenlabs && (
            <div className="settings-sub muted">
              ElevenLabs indisponible (clé absente dans .env, ou service injoignable) — voix Edge gratuites ci-dessous.
            </div>
          )}

          {voices && (
            <>
              <div className="settings-sub">Microsoft Edge — gratuites, sans clé</div>
              <VoiceList provider="edge" list={voices.edge} />
            </>
          )}
        </section>

        <section className="settings-section">
          <h3>Modèle IA</h3>
          {demoMode && (
            <div className="settings-sub muted">
              Mode démo actif : aucune consommation. Ce choix s'appliquera dès qu'une clé API sera configurée.
            </div>
          )}
          <ul className="model-list">
            <li className={modelChoice === "auto" ? "active" : ""} onClick={() => setModelChoice("auto")}>
              <div className="voice-name">Automatique (recommandé)</div>
              <div className="voice-hint">JARVIS choisit selon la demande : rapide, équilibré ou profond — coût maîtrisé.</div>
            </li>
            {models.map((m) => (
              <li
                key={m.tier}
                className={modelChoice === m.tier ? "active" : ""}
                onClick={() => setModelChoice(m.tier as ModelChoice)}
              >
                <div className="voice-name">{m.label}</div>
                <div className="voice-hint">{m.model}</div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
