import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useJarvis } from "../state";
import { dictateOnce, isSpeechSupported } from "../voice";
import Orb from "./Orb";
import Hologram from "./Hologram";
import Avatar3D from "./Avatar3D";
import Hud from "./Hud";
import BrainCanvas from "./brain/BrainCanvas";
import SettingsSheet from "./SettingsSheet";
import SpotifyBar from "./SpotifyBar";
import {
  IconGear,
  IconImage,
  IconMic,
  IconOrb,
  IconSend,
  IconSparkles,
  IconSpeaker,
  IconSpeakerOff,
  IconWave,
} from "./icons";

/**
 * L'accueil est un cockpit : données et orbe à gauche, le cerveau-galaxie
 * interactif au centre, la conversation à droite.
 */

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

function shortModel(id?: string | null): string {
  return (id ?? "—").replace(/^claude-/, "");
}


/** Colonne de gauche : HUD, réglages, orbe, données vivantes. */
function LeftColumn({
  onOrbClick,
  onOpenSettings,
  dictating,
  vrmMissing,
}: {
  onOrbClick: () => void;
  onOpenSettings: () => void;
  dictating: boolean;
  vrmMissing: boolean;
}) {
  const demoMode = useJarvis((s) => s.demoMode);
  const wakeEnabled = useJarvis((s) => s.wakeEnabled);
  const setWakeEnabled = useJarvis((s) => s.setWakeEnabled);
  const ttsEnabled = useJarvis((s) => s.ttsEnabled);
  const setTtsEnabled = useJarvis((s) => s.setTtsEnabled);
  const persona = useJarvis((s) => s.persona);
  const setPersona = useJarvis((s) => s.setPersona);
  const activeModel = useJarvis((s) => s.activeModel);
  const activeModelReason = useJarvis((s) => s.activeModelReason);
  const nodes = useJarvis((s) => s.nodes);
  const memories = useJarvis((s) => s.memories);
  const tasks = useJarvis((s) => s.tasks);
  const activity = useJarvis((s) => s.activity);
  const toggleTask = useJarvis((s) => s.toggleTask);
  const openTasks = tasks.filter((t) => !t.done);

  return (
    <aside className="cockpit-left">
      <Hud />

      <div className="pill-row">
        {demoMode && <span className="pill demo-pill">Démo · 0 API</span>}
        {isSpeechSupported() && (
          <button className={`pill toggle ${wakeEnabled ? "on" : ""}`} title="Mot d'activation « Jarvis »" onClick={() => setWakeEnabled(!wakeEnabled)}>
            <IconWave size={13} /> «&nbsp;Jarvis&nbsp;»
          </button>
        )}
        <button className={`pill toggle ${ttsEnabled ? "on" : ""}`} title="Réponses à voix haute" onClick={() => setTtsEnabled(!ttsEnabled)}>
          {ttsEnabled ? <IconSpeaker size={13} /> : <IconSpeakerOff size={13} />} voix
        </button>
        <button className="pill toggle" title="Orbe ou avatar holographique" onClick={() => setPersona(persona === "orb" ? "hologram" : "orb")}>
          {persona === "orb" ? <IconSparkles size={13} /> : <IconOrb size={13} />}
          {persona === "orb" ? "avatar" : "orbe"}
        </button>
        <button className="pill toggle" title="Réglages — voix et modèle IA" onClick={onOpenSettings}>
          <IconGear size={13} /> réglages
        </button>
      </div>

      <div className={`orb-slot ${dictating ? "dictating" : ""}`}>
        {/* En mode avatar, le personnage flotte dans l'espace du cerveau ;
            l'orbe reste ici. Sans fichier VRM : repli image dans la colonne. */}
        {persona === "hologram" && vrmMissing ? (
          <Hologram size={160} onClick={onOrbClick} />
        ) : (
          <Orb size={185} onClick={onOrbClick} />
        )}
      </div>

      <SpotifyBar />

      <section className="glass card mini">
        <h2>Statut</h2>
        <div className="status-row"><span className="k">modèle</span><span className="v">{shortModel(activeModel)}</span></div>
        <div className="status-row"><span className="k">routage</span><span className="v">{activeModelReason ?? "en attente"}</span></div>
        <div className="status-row"><span className="k">nœuds</span><span className="v">{nodes.length}</span></div>
        <div className="status-row"><span className="k">mémoires</span><span className="v">{memories.length}</span></div>
        <div className="status-row"><span className="k">tâches ouvertes</span><span className="v">{openTasks.length}</span></div>
      </section>

      <section className="glass card mini">
        <h2>Tâches</h2>
        {openTasks.length === 0 && <span className="muted">Rien en attente.</span>}
        {openTasks.slice(0, 6).map((t) => (
          <label key={t.id} className="task-line">
            <input type="checkbox" checked={false} onChange={() => void toggleTask(t.id)} />
            <span className="task-check" />
            <span className="task-title">{t.title}</span>
            {t.due && <span className="task-due">{t.due}</span>}
          </label>
        ))}
      </section>

      <section className="glass card mini">
        <h2>Activité</h2>
        {activity.length === 0 && <span className="muted">—</span>}
        {activity.slice(0, 6).map((a) => (
          <div key={a.id} className="activity-line">
            <span className="activity-kind">{a.kind}</span>
            {a.message}
          </div>
        ))}
      </section>
    </aside>
  );
}

export default function HomeView() {
  const messages = useJarvis((s) => s.messages);
  const streaming = useJarvis((s) => s.streaming);
  const toolActivity = useJarvis((s) => s.toolActivity);
  const sendMessage = useJarvis((s) => s.sendMessage);
  const setOrbState = useJarvis((s) => s.setOrbState);
  const persona = useJarvis((s) => s.persona);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dictating, setDictating] = useState(false);
  const [vrmMissing, setVrmMissing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stopDictation = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    <div className="cockpit">
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      <LeftColumn
        onOrbClick={toggleDictation}
        onOpenSettings={() => setSettingsOpen(true)}
        dictating={dictating}
        vrmMissing={vrmMissing}
      />

      <section className="cockpit-center">
        <BrainCanvas
          overlay={
            persona === "hologram" && !vrmMissing ? (
              <Avatar3D variant="space" onClick={toggleDictation} onUnavailable={() => setVrmMissing(true)} />
            ) : undefined
          }
        />
      </section>

      <aside className="cockpit-chat glass">
        <header className="chat-head">
          Conversation
          <span className="muted">{streaming ? "● en cours" : `${messages.length}`}</span>
        </header>

        <div className="thread" ref={scrollRef}>
          {messages.length === 0 && (
            <>
              <div className="bubble assistant">
                Mes salutations. Je suis <b>J.A.R.V.I.S</b>, votre assistant personnel. Parlez-moi — dites
                «&nbsp;Jarvis&nbsp;» — ou écrivez-moi. Tout ce que j'apprends illumine le cerveau au centre.
              </div>
              <div className="suggestions column">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
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
                        <span className="meta-chip" title={m.modelReason}>{shortModel(m.model)}</span>
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
      </aside>
    </div>
  );
}
