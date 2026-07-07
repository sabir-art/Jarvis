import { useJarvis } from "../state";

/**
 * L'orbe JARVIS — la présence physique de l'assistant.
 * Une sphère noire au rim light doux (référence : le visuel fourni par
 * l'utilisateur), qui respire au repos, s'auréole quand elle écoute,
 * scintille quand elle réfléchit et pulse quand elle parle.
 */
export default function Orb({ size = 300, onClick }: { size?: number; onClick?: () => void }) {
  const orbState = useJarvis((s) => s.orbState);

  const label =
    orbState === "listening"
      ? "Je vous écoute…"
      : orbState === "thinking"
        ? "Je réfléchis…"
        : orbState === "speaking"
          ? ""
          : "";

  return (
    <div className="orb-wrap" style={{ width: size }}>
      <div
        className={`orb ${orbState}`}
        style={{ width: size, height: size }}
        onClick={onClick}
        role="button"
        aria-label="Parler à Jarvis"
        title="Dites « Jarvis » ou cliquez pour parler"
      >
        <div className="orb-ring" />
        <div className="orb-ring orb-ring-2" />
        <div className="orb-shimmer" />
        <span className="orb-wordmark">J.A.R.V.I.S</span>
      </div>
      <div className={`orb-status ${label ? "visible" : ""}`}>{label}</div>
    </div>
  );
}
