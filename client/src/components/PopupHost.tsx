import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useJarvis } from "../state";
import { IconCheck, IconClose } from "./icons";

/**
 * Le popup de JARVIS : quand il montre quelque chose (e-mails, agenda,
 * musique, note…), une carte de verre s'ouvre à droite avec le contenu —
 * consultable et actionnable (éditer une note, cocher une tâche…).
 */

const TITLES: Record<string, string> = {
  emails: "Boîte de réception",
  agenda: "Agenda",
  spotify: "Lecture en cours",
  slack: "Slack",
  drive: "Google Drive",
  notion: "Notion",
  figma: "Figma",
  chrome: "Navigation récente",
  tasks: "Tâches",
  note: "Note",
  wiki: "Synthèse wiki",
  weather: "Météo",
};

function NotePanel({ payload }: { payload: { id: string; title: string; content: string } }) {
  const [title, setTitle] = useState(payload.title);
  const [content, setContent] = useState(payload.content);
  const [saved, setSaved] = useState(false);
  const refresh = useJarvis((s) => s.refreshPanels);

  const saveNote = async () => {
    await fetch(`/api/notes/${payload.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    void refresh();
    void useJarvis.getState().refreshGraph();
  };

  return (
    <>
      <input className="popup-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="popup-textarea" rows={7} value={content} onChange={(e) => setContent(e.target.value)} />
      <button className="glass-btn ok" onClick={() => void saveNote()}>
        <IconCheck size={15} /> {saved ? "Enregistré ✓" : "Enregistrer"}
      </button>
    </>
  );
}

function TasksPanel({ payload }: { payload: { id: string; title: string; due?: string; done: boolean }[] }) {
  const toggleTask = useJarvis((s) => s.toggleTask);
  const tasks = useJarvis((s) => s.tasks);
  const shown = tasks.filter((t) => payload.some((p) => p.id === t.id) || !t.done);
  return (
    <div>
      {shown.map((t) => (
        <label key={t.id} className={`task-line ${t.done ? "done" : ""}`}>
          <input type="checkbox" checked={t.done} onChange={() => void toggleTask(t.id)} />
          <span className="task-check">{t.done && <IconCheck size={12} />}</span>
          <span className="task-title">{t.title}</span>
          {t.due && <span className="task-due">{t.due}</span>}
        </label>
      ))}
    </div>
  );
}

function Body({ panel, payload }: { panel: string; payload: unknown }) {
  switch (panel) {
    case "emails": {
      const emails = payload as { from: string; subject: string; preview: string; time: string; unread: boolean }[];
      return (
        <ul className="data-list">
          {emails.map((e, i) => (
            <li key={i} className={e.unread ? "unread" : ""}>
              <div className="row-head"><b>{e.from}</b><span>{e.time}</span></div>
              <div className="row-title">{e.subject}</div>
              <div className="row-sub">{e.preview}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "agenda": {
      const events = payload as { title: string; start: string; end: string; where: string; day: string }[];
      return (
        <div>
          {events.map((e, i) => (
            <div key={i} className="event-row">
              <span className="event-time">{e.day === "aujourd'hui" ? e.start : e.day}</span>
              <div>
                <div className="row-title">{e.title}</div>
                <div className="row-sub">{e.start}–{e.end} · {e.where}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "spotify": {
      const d = payload as { nowPlaying: { title: string; artist: string }; playing?: { name: string; tracks: number }; queue: { title: string; artist: string }[] };
      return (
        <>
          <div className="now-playing">
            <span className="eq"><i /><i /><i /></span>
            <div>
              <div className="row-title">{d.nowPlaying.title}</div>
              <div className="row-sub">{d.nowPlaying.artist}{d.playing ? ` · ${d.playing.name}` : ""}</div>
            </div>
          </div>
          <div className="muted" style={{ margin: "8px 0 4px" }}>À suivre</div>
          <ul className="data-list">
            {d.queue.map((t, i) => (
              <li key={i}><div className="row-title">{t.title}</div><div className="row-sub">{t.artist}</div></li>
            ))}
          </ul>
        </>
      );
    }
    case "slack": {
      const messages = payload as { channel: string; from: string; text: string; time: string }[];
      return (
        <ul className="data-list">
          {messages.map((m, i) => (
            <li key={i}>
              <div className="row-head"><b>{m.channel}</b><span>{m.time}</span></div>
              <div className="row-sub"><b>{m.from}</b> — {m.text}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "drive":
    case "notion":
    case "figma": {
      const list = payload as Record<string, string | number>[];
      return (
        <ul className="data-list">
          {list.map((f, i) => (
            <li key={i}>
              <div className="row-title">{String(f.name ?? f.title)}</div>
              <div className="row-sub">{[f.kind, f.modified ?? f.edited, f.pages ? `${f.pages} pages` : null].filter(Boolean).join(" · ")}</div>
            </li>
          ))}
        </ul>
      );
    }
    case "chrome": {
      const history = payload as { title: string; url: string; when: string }[];
      return (
        <ul className="data-list">
          {history.map((h, i) => (
            <li key={i}><div className="row-title">{h.title}</div><div className="row-sub">{h.url} · {h.when}</div></li>
          ))}
        </ul>
      );
    }
    case "tasks":
      return <TasksPanel payload={payload as { id: string; title: string; due?: string; done: boolean }[]} />;
    case "note":
      return <NotePanel payload={payload as { id: string; title: string; content: string }} />;
    case "wiki": {
      const page = payload as { title: string; content: string };
      return (
        <div className="wiki-page">
          <ReactMarkdown>{page.content}</ReactMarkdown>
        </div>
      );
    }
    case "weather": {
      const w = payload as { city: string; temperature: number; sky: string };
      return (
        <div className="weather-big">
          <div className="weather-temp">{w.temperature}°</div>
          <div className="row-title">{w.city}</div>
          <div className="row-sub">{w.sky}</div>
        </div>
      );
    }
    default:
      return <pre className="muted">{JSON.stringify(payload, null, 2)}</pre>;
  }
}

export default function PopupHost() {
  const popup = useJarvis((s) => s.popup);
  const setPopup = useJarvis((s) => s.setPopup);

  // Échap ferme le popup.
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup, setPopup]);

  if (!popup) return null;

  return (
    <aside className="popup glass" key={popup.panel + JSON.stringify(popup.payload).length}>
      <header className="popup-head">
        <h2>{TITLES[popup.panel] ?? popup.panel}</h2>
        <button className="icon-btn" onClick={() => setPopup(null)} title="Fermer">
          <IconClose size={16} />
        </button>
      </header>
      <div className="popup-body">
        <Body panel={popup.panel} payload={popup.payload} />
      </div>
    </aside>
  );
}
