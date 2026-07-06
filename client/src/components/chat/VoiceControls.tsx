import { useEffect, useRef, useState } from "react";
import { useJarvis } from "../../state";

/**
 * Voix : dictée (Web Speech API), mode mains libres avec mot d'activation
 * « Jarvis », et synthèse vocale des réponses. Aucun service externe requis
 * (Chrome/Edge recommandés).
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

function makeRecognizer(): SpeechRecognitionLike | null {
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: SpeechRecognitionLike = new Ctor();
  r.lang = "fr-FR";
  return r;
}

export default function VoiceControls({
  onTranscript,
  onSend,
}: {
  onTranscript: (text: string) => void;
  onSend: (text: string) => void;
}) {
  const ttsEnabled = useJarvis((s) => s.ttsEnabled);
  const setTtsEnabled = useJarvis((s) => s.setTtsEnabled);
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree;
  const supported = typeof window !== "undefined" &&
    Boolean((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  const startDictation = () => {
    const rec = makeRecognizer();
    if (!rec) return;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      const res = e.results[e.results.length - 1];
      const text = res[0].transcript.trim();
      onTranscript(text);
      if (res.isFinal && text) onSend(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const startHandsFree = () => {
    const rec = makeRecognizer();
    if (!rec) return;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const res = e.results[e.results.length - 1];
      if (!res.isFinal) return;
      const text: string = res[0].transcript.trim();
      const m = text.match(/^(?:ok\s+)?jarvis[\s,:.!]*(.*)$/i);
      if (m && m[1].trim()) onSend(m[1].trim());
    };
    // Chrome coupe la reconnaissance continue : on relance tant que le mode est actif.
    rec.onend = () => {
      if (handsFreeRef.current) {
        try {
          rec.start();
        } catch {
          /* déjà relancé */
        }
      } else {
        setListening(false);
      }
    };
    rec.onerror = () => undefined;
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  useEffect(() => () => stop(), []);

  if (!supported) {
    return (
      <button
        className={`btn ${ttsEnabled ? "active" : ""}`}
        title="Synthèse vocale des réponses"
        onClick={() => setTtsEnabled(!ttsEnabled)}
      >
        🔊
      </button>
    );
  }

  return (
    <>
      <button
        className={`btn ${listening && !handsFree ? "active" : ""}`}
        title="Dicter un message"
        onClick={() => {
          if (handsFree) return;
          listening ? stop() : startDictation();
        }}
        disabled={handsFree}
      >
        🎙
      </button>
      <button
        className={`btn ${handsFree ? "active" : ""}`}
        title="Mode mains libres : dites « Jarvis, … »"
        onClick={() => {
          if (handsFree) {
            setHandsFree(false);
            stop();
          } else {
            setHandsFree(true);
            startHandsFree();
          }
        }}
      >
        ∞
      </button>
      <button
        className={`btn ${ttsEnabled ? "active" : ""}`}
        title="Lire les réponses à voix haute"
        onClick={() => setTtsEnabled(!ttsEnabled)}
      >
        🔊
      </button>
    </>
  );
}
