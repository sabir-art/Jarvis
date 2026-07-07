import type { FC, ReactNode } from "react";

/**
 * Icônes de JARVIS — SVG inline, cohérentes (trait 1.6, extrémités rondes),
 * teintées par `currentColor`. Les marques des connecteurs sont des
 * reproductions simplifiées mais reconnaissables, aux couleurs officielles.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Base({ size = 20, className, children, viewBox = "0 0 24 24" }: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/* ── Interface ─────────────────────────────────────────────────── */

export const IconOrb = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M7 9.2a6 6 0 0 1 10 0" opacity={0.45} />
  </Base>
);

export const IconBrain = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="5" cy="7" r="1.4" />
    <circle cx="19" cy="7" r="1.4" />
    <circle cx="5" cy="17" r="1.4" />
    <circle cx="19" cy="17" r="1.4" />
    <path d="M10.2 10.8 6.2 8m11.6 0-4 2.8m-3.6 2.4-4 2.8m11.6 0-4-2.8" />
  </Base>
);

export const IconBook = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5V5.5M20 18v3H6.5" />
    <path d="M8.5 7.5h7M8.5 10.5h5" opacity={0.55} />
  </Base>
);

export const IconPlug = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 3v5m6-5v5" />
    <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6z" />
    <path d="M12 17v4" />
  </Base>
);

export const IconChecklist = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 6.5 1.5 1.5L8.5 5M4 13l1.5 1.5L8.5 11.5M4 19.5 5.5 21l3-3" />
    <path d="M12 6.5h8M12 13h8M12 19.5h8" opacity={0.7} />
  </Base>
);

export const IconSparkles = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4.5 13.6 9l4.4 1.5-4.4 1.5L12 16.5 10.4 12 6 10.5 10.4 9z" />
    <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" opacity={0.7} />
  </Base>
);

export const IconMic = (p: IconProps) => (
  <Base {...p}>
    <rect x="9.2" y="3.5" width="5.6" height="10" rx="2.8" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.8" />
  </Base>
);

export const IconWave = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10.5v3M8 7.5v9M12 5v14M16 7.5v9M20 10.5v3" />
  </Base>
);

export const IconSpeaker = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.8a8 8 0 0 1 0 10.4" opacity={0.7} />
  </Base>
);

export const IconSpeakerOff = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z" />
    <path d="m16 9.5 5 5m0-5-5 5" />
  </Base>
);

export const IconSend = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12 20 4.5 16.5 19l-4.6-4.6z" />
    <path d="M11.9 14.4 20 4.5" opacity={0.55} />
  </Base>
);

export const IconImage = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m6 18 4.5-4.5 3 3 2.5-2.5 2.5 2.5" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15.5 15.5 4.5 4.5" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const IconBroom = (p: IconProps) => (
  <Base {...p}>
    <path d="m14 4 6 6" />
    <path d="M16.5 12.5 11.5 7.5 4 15c-1 1 0 5 0 5s4 1 5 0z" />
  </Base>
);

export const IconGalaxyView = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="1.8" />
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    <path d="M12 7a5 5 0 1 0 5 5" opacity={0.55} />
  </Base>
);

export const IconGridView = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </Base>
);

export const IconChat = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
    <path d="M8 9h8M8 12.5h5" opacity={0.55} />
  </Base>
);

export const IconInfinity = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 15.5c-2 0-3.5-1.6-3.5-3.5S6 8.5 8 8.5c3.5 0 4.5 7 8 7 2 0 3.5-1.6 3.5-3.5S18 8.5 16 8.5c-3.5 0-4.5 7-8 7z" />
  </Base>
);

/* ── Marques des connecteurs (simplifiées, couleurs officielles) ── */

const brandProps = { fill: "none", stroke: "none" } as const;

export const BrandGmail = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="2" y="4.5" width="20" height="15" rx="2.4" fill="#fff" />
    <path d="M2 7.5 12 14 22 7.5V17a2.4 2.4 0 0 1-2.4 2.4H4.4A2.4 2.4 0 0 1 2 17z" fill="#EA4335" opacity={0.14} />
    <path d="M2.6 5.6 12 12.2l9.4-6.6" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
    <path d="M2.6 5.8v12.6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
    <path d="M21.4 5.8v12.6" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const BrandGCal = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="3" y="4" width="18" height="17" rx="2.5" fill="#4285F4" />
    <rect x="3" y="4" width="18" height="4.5" rx="2.2" fill="#1967D2" />
    <rect x="6.5" y="1.8" width="2.2" height="4" rx="1.1" fill="#fff" />
    <rect x="15.3" y="1.8" width="2.2" height="4" rx="1.1" fill="#fff" />
    <text x="12" y="17.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">31</text>
  </svg>
);

export const BrandGDrive = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <path d="M8.6 3.5h6.8L22 15h-6.8z" fill="#FBBC04" />
    <path d="M8.6 3.5 2 15l3.4 5.5L12 9z" fill="#34A853" />
    <path d="M5.4 20.5h13.2L22 15H8.8z" fill="#4285F4" />
  </svg>
);

export const BrandSpotify = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <circle cx="12" cy="12" r="10" fill="#1DB954" />
    <path d="M6.8 9.6c3.6-1.1 7.6-.8 10.6 1" stroke="#0a0a0a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M7.4 12.7c3-.9 6.2-.6 8.7.8" stroke="#0a0a0a" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <path d="M8 15.6c2.4-.7 4.8-.5 6.8.6" stroke="#0a0a0a" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  </svg>
);

export const BrandNotion = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="3.5" y="3" width="17" height="18" rx="2.6" fill="#fff" />
    <rect x="3.5" y="3" width="17" height="18" rx="2.6" stroke="#0a0a0a" strokeWidth="1.2" fill="none" />
    <path d="M8 17V7.5l7.2 9V7" stroke="#0a0a0a" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const BrandSlack = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="12.6" y="3" width="3.4" height="8.2" rx="1.7" fill="#36C5F0" />
    <rect x="8" y="12.8" width="3.4" height="8.2" rx="1.7" fill="#E01E5A" />
    <rect x="3" y="8" width="8.2" height="3.4" rx="1.7" fill="#2EB67D" />
    <rect x="12.8" y="12.6" width="8.2" height="3.4" rx="1.7" fill="#ECB22E" />
  </svg>
);

export const BrandFigma = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <path d="M9 3.5h3v5.6H9a2.8 2.8 0 1 1 0-5.6z" fill="#F24E1E" />
    <path d="M12 3.5h3a2.8 2.8 0 1 1 0 5.6h-3z" fill="#FF7262" />
    <path d="M9 9.2h3v5.6H9a2.8 2.8 0 1 1 0-5.6z" fill="#A259FF" />
    <circle cx="14.9" cy="12" r="2.8" fill="#1ABCFE" />
    <path d="M9 14.9h3v2.8A2.8 2.8 0 1 1 9 14.9z" fill="#0ACF83" />
  </svg>
);

export const BrandAdobe = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <path d="M9.5 4H3v16zM14.5 4H21v16zM12 9.5 16.8 20h-3.2l-1.4-3.4H9z" fill="#FA0F00" />
  </svg>
);

export const BrandHiggsfield = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#101014" />
    <path d="M12 5.5 13.9 10l4.6 1.9-4.6 1.9L12 18.5l-1.9-4.7-4.6-1.9L10.1 10z" fill="#B48CFF" />
  </svg>
);

export const BrandRunware = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#0E1B2C" />
    <path d="M12 5.5c2.8 3.1 4.5 5.5 4.5 7.7a4.5 4.5 0 0 1-9 0c0-2.2 1.7-4.6 4.5-7.7z" fill="#41B4FF" />
  </svg>
);

export const BrandWebflow = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#146EF5" />
    <path d="m6 9 2.4 6L11 9.5 13 15l2.6-6H18l-4.2 8.5h-1.6L10.6 13l-1.8 4.5H7.2z" fill="#fff" />
  </svg>
);

export const BrandChrome = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...brandProps} aria-hidden>
    <circle cx="12" cy="12" r="9.5" fill="#fff" />
    <path d="M12 2.5a9.5 9.5 0 0 1 8.2 4.75H12a4.75 4.75 0 0 0-4.4 3z" fill="#EA4335" />
    <path d="M20.2 7.25a9.5 9.5 0 0 1-4.1 13L12.9 16.6a4.75 4.75 0 0 0 3.85-6.35z" fill="#FBBC04" />
    <path d="M3.7 6.9a9.5 9.5 0 0 0 4.2 13.4l3.3-5.7A4.75 4.75 0 0 1 7.6 10z" fill="#34A853" />
    <circle cx="12" cy="12" r="3.4" fill="#4285F4" stroke="#fff" strokeWidth="1" />
  </svg>
);

export const BRAND_ICONS: Record<string, FC<IconProps>> = {
  gmail: BrandGmail,
  gcal: BrandGCal,
  gdrive: BrandGDrive,
  spotify: BrandSpotify,
  notion: BrandNotion,
  slack: BrandSlack,
  figma: BrandFigma,
  adobe: BrandAdobe,
  higgsfield: BrandHiggsfield,
  runware: BrandRunware,
  webflow: BrandWebflow,
  chrome: BrandChrome,
};
