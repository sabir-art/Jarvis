import { useEffect, useState } from "react";
import { getJSON } from "../../api";
import { useJarvis } from "../../state";
import { IconCheck } from "../icons";

interface CalEvent {
  title: string;
  start: string;
  end: string;
  where: string;
  day: string;
}

/** Agenda & tâches : la journée d'un coup d'œil. */
export default function TasksView() {
  const tasks = useJarvis((s) => s.tasks);
  const memories = useJarvis((s) => s.memories);
  const toggleTask = useJarvis((s) => s.toggleTask);
  const [events, setEvents] = useState<CalEvent[]>([]);

  useEffect(() => {
    getJSON<{ data: { events: CalEvent[] } }>("/api/connectors/gcal")
      .then((r) => setEvents(r.data.events))
      .catch(() => setEvents([]));
  }, []);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="view tasks-view">
      <header className="view-head">
        <div>
          <h1>Agenda & tâches</h1>
          <p>Dites « Jarvis, rappelle-moi de… » pour ajouter une tâche à la voix.</p>
        </div>
      </header>

      <div className="tasks-layout">
        <section className="glass card">
          <h2>Aujourd'hui</h2>
          {events.filter((e) => e.day === "aujourd'hui").map((e, i) => (
            <div key={i} className="event-row">
              <span className="event-time">{e.start}</span>
              <div>
                <div className="row-title">{e.title}</div>
                <div className="row-sub">{e.where}</div>
              </div>
            </div>
          ))}
          <h2 style={{ marginTop: 18 }}>À venir</h2>
          {events.filter((e) => e.day !== "aujourd'hui").map((e, i) => (
            <div key={i} className="event-row">
              <span className="event-time">{e.day}</span>
              <div>
                <div className="row-title">{e.title}</div>
                <div className="row-sub">{e.start} · {e.where}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="glass card">
          <h2>Tâches <span className="muted">· {open.length} ouvertes</span></h2>
          {open.length === 0 && <p className="muted">Rien en attente. Journée maîtrisée.</p>}
          {open.map((t) => (
            <label key={t.id} className="task-line">
              <input type="checkbox" checked={false} onChange={() => void toggleTask(t.id)} />
              <span className="task-check" />
              <span className="task-title">{t.title}</span>
              {t.due && <span className="task-due">{t.due}</span>}
            </label>
          ))}
          {done.length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Terminées</h2>
              {done.map((t) => (
                <label key={t.id} className="task-line done">
                  <input type="checkbox" checked onChange={() => void toggleTask(t.id)} />
                  <span className="task-check"><IconCheck size={12} /></span>
                  <span className="task-title">{t.title}</span>
                </label>
              ))}
            </>
          )}
        </section>

        <section className="glass card">
          <h2>Ce que Jarvis sait de vous</h2>
          {memories.length === 0 && <p className="muted">Jarvis retiendra ici ce qu'il apprend.</p>}
          {memories.slice().reverse().map((m) => (
            <div key={m.id} className="memory-line">
              <span className="memory-cat">{m.category}</span>
              {m.content}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
