import { useEffect, useRef } from "react";
import { useJarvis } from "./state";

/**
 * Moteur vocal de JARVIS (Web Speech API, aucun service externe).
 *
 * Mode mains libres façon Siri : l'écoute tourne en continu ; dire
 * « Jarvis », « Hello Jarvis » ou « Bonjour Jarvis » réveille l'orbe.
 *  - « Jarvis, mets de la musique » → la commande part immédiatement ;
 *  - « Jarvis » seul → l'orbe passe en écoute active et attend la suite.
 * L'écoute est suspendue pendant que JARVIS parle (pour ne pas s'entendre).
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" &&
    Boolean((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}

function makeRecognizer(): Recognition | null {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "fr-FR";
  return rec;
}

/**
 * Reconnaît les prononciations approximatives du réveil, avec une tolérance
 * d'un ou deux mots d'amorce (« Dis-moi Jarvis… », « Euh, Jarvis… »).
 * Une mention en milieu de phrase ne déclenche pas.
 */
const WAKE_RE = /^\s*(?:[\wàâéèêëîïôöûüç'-]+[\s,]+){0,2}(?:jarvis|garvis|djarvis|jarviss|jarvys)\b[\s,:.!?]*(.*)$/i;

/** Petit carillon de réveil (WebAudio, aucun fichier). */
function chime(): void {
  try {
    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    /* silencieux */
  }
}

/** Événements de suspension : JARVIS parle, ou l'utilisateur dicte au micro. */
const SUPPRESS_START = ["jarvis-tts-start", "jarvis-dictation-start"];
const SUPPRESS_END = ["jarvis-tts-end", "jarvis-dictation-end"];

export function useVoiceEngine(): void {
  const wakeEnabled = useJarvis((s) => s.wakeEnabled);
  const awaitingRef = useRef<number | null>(null); // « Jarvis » seul : on attend la commande

  useEffect(() => {
    if (!wakeEnabled || !isSpeechSupported()) return;

    // État LOCAL à cette exécution de l'effet : un ancien cycle (toggle rapide)
    // ne peut pas interférer avec le nouveau.
    let alive = true;
    let current: Recognition | null = null;
    let restartTimer: number | null = null;
    let suppressed = 0; // compteur : TTS et dictée peuvent se chevaucher
    let failStreak = 0; // démarrages avortés consécutifs (pas de micro, pas de backend)
    let lastStartAt = 0;

    const clearAwaiting = () => {
      if (awaitingRef.current) {
        window.clearTimeout(awaitingRef.current);
        awaitingRef.current = null;
      }
      const s = useJarvis.getState();
      if (s.orbState === "listening") s.setOrbState("idle");
    };

    const handleFinal = (transcript: string) => {
      const s = useJarvis.getState();
      if (suppressed > 0 || s.streaming) return;

      const awaiting = awaitingRef.current !== null;
      const m = transcript.match(WAKE_RE);

      if (m) {
        const command = m[1].trim();
        if (command) {
          clearAwaiting();
          chime();
          void s.sendMessage(command, { viaVoice: true });
        } else {
          // « Jarvis » seul : écoute active pendant 8 s.
          chime();
          s.setOrbState("listening");
          if (awaitingRef.current) window.clearTimeout(awaitingRef.current);
          awaitingRef.current = window.setTimeout(clearAwaiting, 8000);
        }
        return;
      }

      if (awaiting && transcript.trim()) {
        clearAwaiting();
        void s.sendMessage(transcript.trim(), { viaVoice: true });
      }
    };

    const scheduleRestart = () => {
      if (!alive || suppressed > 0) return;
      // Backoff : si les sessions meurent aussitôt (pas de micro, backend
      // vocal absent), on espace puis on renonce — pas de boucle infinie.
      const delay = failStreak === 0 ? 250 : Math.min(500 * 2 ** failStreak, 30000);
      if (failStreak >= 6) return; // on renonce pour cette session
      if (restartTimer) window.clearTimeout(restartTimer);
      restartTimer = window.setTimeout(start, delay);
    };

    const start = () => {
      if (!alive || current || suppressed > 0) return;
      const rec = makeRecognizer();
      if (!rec) return;
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        if (last?.isFinal) handleFinal(last[0].transcript);
      };
      rec.onend = () => {
        if (current === rec) current = null; // ne pas écraser un recognizer plus récent
        const lifetime = Date.now() - lastStartAt;
        failStreak = lifetime < 1000 ? failStreak + 1 : 0;
        scheduleRestart();
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          alive = false; // micro refusé : on n'insiste pas
          useJarvis.getState().setWakeEnabled(false);
        }
      };
      current = rec;
      lastStartAt = Date.now();
      try {
        rec.start();
      } catch {
        current = null;
      }
    };

    const onSuppressStart = () => {
      suppressed++;
      current?.abort();
      current = null;
    };
    const onSuppressEnd = () => {
      suppressed = Math.max(0, suppressed - 1);
      failStreak = 0;
      if (suppressed === 0) {
        if (restartTimer) window.clearTimeout(restartTimer);
        restartTimer = window.setTimeout(start, 200);
      }
    };
    for (const ev of SUPPRESS_START) window.addEventListener(ev, onSuppressStart);
    for (const ev of SUPPRESS_END) window.addEventListener(ev, onSuppressEnd);

    start();

    return () => {
      alive = false;
      for (const ev of SUPPRESS_START) window.removeEventListener(ev, onSuppressStart);
      for (const ev of SUPPRESS_END) window.removeEventListener(ev, onSuppressEnd);
      if (restartTimer) window.clearTimeout(restartTimer);
      clearAwaiting();
      current?.abort();
      current = null;
    };
  }, [wakeEnabled]);
}

/**
 * Dictée ponctuelle (bouton micro) : une phrase → envoi.
 * Suspend le moteur de réveil pendant la dictée (une seule session de
 * reconnaissance à la fois dans Chrome), et le relâche à la fin.
 */
export function dictateOnce(onTranscript: (text: string) => void, onFinal: (text: string) => void, onEnd: () => void): () => void {
  const rec = makeRecognizer();
  if (!rec) {
    onEnd();
    return () => undefined;
  }
  window.dispatchEvent(new CustomEvent("jarvis-dictation-start"));
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    window.dispatchEvent(new CustomEvent("jarvis-dictation-end"));
    onEnd();
  };
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    const text = last[0].transcript.trim();
    onTranscript(text);
    if (last.isFinal && text) onFinal(text);
  };
  rec.onend = end;
  rec.onerror = end;
  rec.start();
  return () => rec.abort();
}
