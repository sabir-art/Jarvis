import { useJarvis } from "../state";

/**
 * L'hologramme — une présence numérique stylisée (inspiration : Norma,
 * Dragon Raja). Un buste féminin holographique bleu, dessiné en SVG :
 * il cligne des yeux, sourit quand il écoute, parle en synchronisation
 * avec la voix, baisse légèrement les yeux quand il réfléchit.
 * Scanlines, lueur et particules complètent l'effet « projection ».
 */
export default function Hologram({ size = 300, onClick }: { size?: number; onClick?: () => void }) {
  const orbState = useJarvis((s) => s.orbState);

  return (
    <div
      className={`holo ${orbState}`}
      style={{ width: size, height: size * 1.18 }}
      onClick={onClick}
      role="button"
      aria-label="Parler à Jarvis"
      title="Dites « Jarvis » ou cliquez pour parler"
    >
      <div className="holo-glow" />
      <svg viewBox="0 0 200 236" className="holo-svg" aria-hidden>
        <defs>
          <linearGradient id="holoBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe9ff" stopOpacity="0.9" />
            <stop offset="0.65" stopColor="#63b9f0" stopOpacity="0.55" />
            <stop offset="1" stopColor="#2b7fc4" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="holoHair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dff4ff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#57a8e8" stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="holoFace" cx="0.5" cy="0.42" r="0.75">
            <stop offset="0" stopColor="#eaf8ff" stopOpacity="0.98" />
            <stop offset="1" stopColor="#9fd4f5" stopOpacity="0.85" />
          </radialGradient>
        </defs>

        {/* chevelure arrière, longue et flottante */}
        <g className="holo-hair-back">
          <path
            d="M100 22 C60 22 44 58 46 96 C48 134 30 176 22 208 C46 196 54 170 56 148 C58 172 48 198 40 218 C64 210 72 178 74 152 L74 96 Z"
            fill="url(#holoHair)"
            opacity="0.5"
          />
          <path
            d="M100 22 C140 22 156 58 154 96 C152 134 170 176 178 208 C154 196 146 170 144 148 C142 172 152 198 160 218 C136 210 128 178 126 152 L126 96 Z"
            fill="url(#holoHair)"
            opacity="0.5"
          />
        </g>

        {/* buste / épaules */}
        <path d="M63 236 C63 196 78 182 100 182 C122 182 137 196 137 236 Z" fill="url(#holoBody)" />
        {/* cou */}
        <path d="M92 156 L92 186 C92 192 108 192 108 186 L108 156 Z" fill="url(#holoFace)" opacity="0.9" />

        {/* visage */}
        <g className="holo-head">
          <ellipse cx="100" cy="106" rx="34" ry="42" fill="url(#holoFace)" />
          {/* frange */}
          <path
            d="M66 100 C64 56 84 40 100 40 C116 40 136 56 134 100 C128 82 122 74 118 62 C112 74 108 76 100 64 C92 76 88 74 82 62 C78 74 72 82 66 100 Z"
            fill="url(#holoHair)"
            opacity="0.95"
          />
          {/* sourcils */}
          <path className="holo-brow" d="M78 96 Q86 92 93 95" stroke="#3f89c9" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path className="holo-brow" d="M107 95 Q114 92 122 96" stroke="#3f89c9" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* yeux */}
          <g className="holo-eye">
            <ellipse cx="86" cy="106" rx="6.5" ry="7.5" fill="#0d3f6b" />
            <ellipse cx="86" cy="105" rx="4.2" ry="5.6" fill="#2f9df0" />
            <circle cx="87.6" cy="102.6" r="1.7" fill="#eaffff" />
          </g>
          <g className="holo-eye">
            <ellipse cx="114" cy="106" rx="6.5" ry="7.5" fill="#0d3f6b" />
            <ellipse cx="114" cy="105" rx="4.2" ry="5.6" fill="#2f9df0" />
            <circle cx="115.6" cy="102.6" r="1.7" fill="#eaffff" />
          </g>
          {/* paupières (clignement) */}
          <rect className="holo-lid" x="78" y="96" width="16" height="0" rx="4" fill="url(#holoFace)" />
          <rect className="holo-lid" x="106" y="96" width="16" height="0" rx="4" fill="url(#holoFace)" />
          {/* nez */}
          <path d="M100 112 L98 122 L102 122" stroke="#66aede" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {/* bouche : parle / sourit / neutre selon l'état */}
          <g className="holo-mouth-group">
            <path className="holo-mouth-line" d="M92 132 Q100 136 108 132" stroke="#2f7fc0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <ellipse className="holo-mouth-open" cx="100" cy="133" rx="6" ry="4" fill="#1a5c95" opacity="0" />
          </g>
        </g>

        {/* mèches avant */}
        <path d="M68 96 C66 130 62 150 56 164 C68 158 74 138 76 112 Z" fill="url(#holoHair)" opacity="0.8" />
        <path d="M132 96 C134 130 138 150 144 164 C132 158 126 138 124 112 Z" fill="url(#holoHair)" opacity="0.8" />
      </svg>

      {/* effets de projection */}
      <div className="holo-scanlines" />
      <div className="holo-base" />
      <span className="holo-particle p1" />
      <span className="holo-particle p2" />
      <span className="holo-particle p3" />
    </div>
  );
}
