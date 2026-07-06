import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useJarvis } from "../../state";
import VoiceControls from "./VoiceControls";

const MODEL_SHORT: Record<string, string> = {};
function shortModel(id?: string): string {
  if (!id) return "";
  if (!MODEL_SHORT[id]) {
    MODEL_SHORT[id] = id.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  }
  return MODEL_SHORT[id];
}

interface Attachment {
  media_type: string;
  data: string;
  preview: string;
}

export default function ChatPanel() {
  const messages = useJarvis((s) => s.messages);
  const streaming = useJarvis((s) => s.streaming);
  const toolActivity = useJarvis((s) => s.toolActivity);
  const sendMessage = useJarvis((s) => s.sendMessage);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, toolActivity]);

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if ((!content && attachments.length === 0) || streaming) return;
    void sendMessage(
      content || "Décrivez cette image.",
      attachments.length ? attachments.map(({ media_type, data }) => ({ media_type, data })) : undefined,
    );
    setInput("");
    setAttachments([]);
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 4)) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        const data = url.split(",")[1];
        setAttachments((a) => [...a, { media_type: file.type, data, preview: url }]);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="panel chat">
      <div className="panel-title">
        Conversation
        <span className="count">{streaming ? "● en cours" : `${messages.length} messages`}</span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="msg assistant">
            <p>
              Bonsoir. Je suis <b>JARVIS</b>, votre assistant personnel. Parlez-moi, confiez-moi des notes,
              des tâches ou des faits à retenir — tout ce que j'apprends illumine le cerveau au centre de
              l'écran. Comment puis-je vous être utile ?
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role} ${m.streaming ? "streaming" : ""}`}>
            {m.role === "assistant" ? (
              <>
                <ReactMarkdown>{m.content}</ReactMarkdown>
                {m.streaming && <span className="cursor" />}
                {m.streaming && toolActivity.length > 0 && (
                  <div className="msg-meta">
                    {toolActivity.map((t) => (
                      <span key={t.name} className={`chip tool-${t.status}`}>
                        ⚙ {t.name}
                      </span>
                    ))}
                  </div>
                )}
                {!m.streaming && (m.model || m.toolsUsed?.length) && (
                  <div className="msg-meta">
                    {m.model && (
                      <span className="chip" title={m.modelReason}>
                        ◈ {shortModel(m.model)}
                      </span>
                    )}
                    {m.toolsUsed?.map((t, i) => (
                      <span key={i} className="chip tool-ok">⚙ {t}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            )}
          </div>
        ))}
      </div>

      <div className="chat-input">
        {attachments.length > 0 && (
          <div className="attach-preview">
            {attachments.map((a, i) => (
              <img
                key={i}
                src={a.preview}
                alt="pièce jointe"
                title="Cliquer pour retirer"
                onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        <textarea
          value={input}
          placeholder="Parlez à JARVIS… (Entrée pour envoyer, Maj+Entrée : nouvelle ligne)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="chat-actions">
          <VoiceControls onTranscript={setInput} onSend={(t) => send(t)} />
          <button className="btn" title="Joindre une image (vision)" onClick={() => fileRef.current?.click()}>
            🖼
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
          <button className="btn primary" style={{ marginLeft: "auto" }} disabled={streaming} onClick={() => send()}>
            Envoyer ➤
          </button>
        </div>
      </div>
    </div>
  );
}
