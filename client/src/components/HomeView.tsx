import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useJarvis } from "../state";
import { dictateOnce, isSpeechSupported } from "../voice";
import Orb from "./Orb";
import Hologram from "./Hologram";
import Hud from "./Hud";
import { GalaxyScene } from "./brain/BrainCanvas";
import {
  IconImage,
  IconMic,
  IconOrb,
  IconSend,
  IconSparkles,
  IconSpeaker,
  IconSpeakerOff,
  IconWave,
} from "./icons";

const SUGGESTIONS = [
  "Quel est mon agenda aujourd'hui ?",
  "Lis mes e-mails",
  "Mets ma playlist Focus",
  "Que sais-tu sur le projet Alpha ?",
];

interface Attachment {
  media_type: string;
  data: string;
  preview: string;
}

export default function HomeView() {
  const messages = useJarvis((s) => s.messages);
  const streaming = useJarvis((s) => s.streaming);
  const toolActivity = useJarvis((s) => s.toolActivity);
  const sendMessage = useJarvis((s) => s.sendMessage);
  const demoMode = useJarvis((s) => s.demoMode);
  const wakeEnabled = useJarvis((s) => s.wakeEnabled);
  const setWakeEnabled = useJarvis((s) => s.setWakeEnabled);
  const ttsEnabled = useJarvis((s) => s.ttsEnabled);
  const setTtsEnabled = useJarvis((s) => s.setTtsEnabled);
  const setOrbState = useJarvis((s) => s.setOrbState);
  const persona = useJarvis((s) => s.persona);
  const setPersona = useJarvis((s) => s.setPersona);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dictating, setDictating] = useState(false);
  const stopDictation = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasConversation = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolActivity]);

  const send = (text?: string, viaVoice = false) => {
    const content = (text ?? input).trim();
    if ((!content && attachments.length === 0) || streaming) return;
    void sendMessage(content || "Décrivez cette image.", {
      images: attachments.length ? attachments.map(({ media_type, data }) => ({ media_type, data })) : undefined,
      viaVoice,
    });
    setInput("");
    setAttachments([]);
  };

  const toggleDictation = () => {
    if (dictating) {
      stopDictation.current?.();
      setDictating(false);
      setOrbState("idle");
      return;
    }
    if (!isSpeechSupported()) return;
    setDictating(true);
    setOrbState("listening");
    stopDictation.current = dictateOnce(
      (t) => setInput(t),
      (t) => {
        // Si une réponse est encore en cours, on garde le texte dans le champ
        // au lieu de le perdre silencieusement.
        if (useJarvis.getState().streaming) {
          setInput(t);
          return;
        }
        setInput("");
        send(t, true);
      },
      () => {
        setDictating(false);
        const s = useJarvis.getState();
        if (s.orbState === "listening") s.setOrbState(s.streaming ? "thinking" : "idle");
      },
    );
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 4)) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        setAttachments((a) => [...a, { media_type: file.type, data: url.split(",")[1], preview: url }]);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`home ${hasConversation ? "conversing" : "hero"}`}>
      {/* Le cerveau, toujours présent derrière l'assistant. */}
      <div className="galaxy-backdrop" aria-hidden>
        <GalaxyScene backdrop />
      </div>

      <Hud />

      <div className="home-status">
        <button
          className="pill toggle"
          title={persona === "orb" ? "Passer à l'avatar holographique" : "Revenir à l'orbe"}
          onClick={() => setPersona(persona === "orb" ? "hologram" : "orb")}
        >
          {persona === "orb" ? <IconSparkles size={13} /> : <IconOrb size={13} />}
          {persona === "orb" ? "avatar" : "orbe"}
        </button>
        {demoMode && <span className="pill demo-pill">Mode démo · 0 conso API</span>}
        {isSpeechSupported() && (
          <button
            className={`pill toggle ${wakeEnabled ? "on" : ""}`}
            title="Mot d'activation « Jarvis »"
            onClick={() => setWakeEnabled(!wakeEnabled)}
          >
            <IconWave size={13} /> «&nbsp;Jarvis&nbsp;»
          </button>
        )}
        <button
          className={`pill toggle ${ttsEnabled ? "on" : ""}`}
          title="Réponses à voix haute"
          onClick={() => setTtsEnabled(!ttsEnabled)}
        >
          {ttsEnabled ? <IconSpeaker size={13} /> : <IconSpeakerOff size={13} />} voix
        </button>
      </div>

      <div className="home-center">
        {persona === "hologram" ? (
          <Hologram size={hasConversation ? 132 : 268} onClick={toggleDictation} />
        ) : (
          <Orb size={hasConversation ? 130 : 290} onClick={toggleDictation} />
        )}
        {!hasConversation && (
          <>
            <p className="home-hint">
              {isSpeechSupported() && wakeEnabled
                ? "Dites « Jarvis » ou « Bonjour Jarvis »… ou écrivez-moi."
                : "Écrivez-moi, ou cliquez sur l'orbe pour dicter."}
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {hasConversation && (
        <div className="thread" ref={scrollRef}>
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role} ${m.streaming ? "streaming" : ""}`}>
              {m.role === "assistant" ? (
                <>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  {m.streaming && <span className="cursor" />}
                  {m.streaming && toolActivity.length > 0 && (
                    <div className="bubble-meta">
                      {toolActivity.map((t) => (
                        <span key={t.name} className={`meta-chip tool-${t.status}`}>{t.name}</span>
                      ))}
                    </div>
                  )}
                  {!m.streaming && (m.model || m.toolsUsed?.length) && (
                    <div className="bubble-meta">
                      {m.model && (
                        <span className="meta-chip" title={m.modelReason}>
                          {m.model.replace(/^claude-/, "")}
                        </span>
                      )}
                      {m.toolsUsed?.map((t, i) => (
                        <span key={i} className="meta-chip tool-ok">{t}</span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                m.content
              )}
            </div>
          ))}
        </div>
      )}

      <div className="composer-zone">
        {attachments.length > 0 && (
          <div className="attach-preview">
            {attachments.map((a, i) => (
              <img key={i} src={a.preview} alt="" onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
        <div className="composer">
          <button
            className={`icon-btn ${dictating ? "active" : ""}`}
            title="Dicter"
            onClick={toggleDictation}
            disabled={!isSpeechSupported() || streaming}
          >
            <IconMic size={19} />
          </button>
          <textarea
            rows={1}
            value={input}
            placeholder={dictating ? "Je vous écoute…" : "Message à Jarvis"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="icon-btn" title="Joindre une image" onClick={() => fileRef.current?.click()}>
            <IconImage size={19} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button className="icon-btn send" title="Envoyer" disabled={streaming} onClick={() => send()}>
            <IconSend size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}
