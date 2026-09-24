import type { ComponentType, SVGProps } from "react";

type IconLike = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/**
 * Empty-state artwork: a small layered "document stack" with the section icon
 * set into a floating tile. Drawn with theme tokens so it works in both modes.
 */
export function EmptyArt({ icon: Icon }: { icon: IconLike }) {
  return (
    <div className="emptyArt" aria-hidden="true">
      <svg viewBox="0 0 160 112" className="emptyArtBg">
        <defs>
          <linearGradient id="ea-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".9" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="ea-grid" fill="none" strokeWidth="1">
          {Array.from({ length: 7 }, (_, i) => (
            <path key={`v${i}`} d={`M${20 + i * 20} 6V106`} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <path key={`h${i}`} d={`M8 ${16 + i * 20}H152`} />
          ))}
        </g>
        <rect className="ea-card ea-card-3" x="38" y="30" width="84" height="62" rx="10" />
        <rect className="ea-card ea-card-2" x="30" y="22" width="100" height="66" rx="11" />
        <g className="ea-card-1">
          <rect x="22" y="14" width="116" height="70" rx="12" />
          <rect className="ea-line" x="36" y="30" width="44" height="6" rx="3" />
          <rect className="ea-line soft" x="36" y="44" width="72" height="5" rx="2.5" />
          <rect className="ea-line soft" x="36" y="56" width="58" height="5" rx="2.5" />
        </g>
        <circle className="ea-spark" cx="140" cy="18" r="3" />
        <circle className="ea-spark two" cx="18" cy="92" r="2" />
      </svg>
      <span className="emptyArtTile">
        <Icon size={20} strokeWidth={1.75} />
      </span>
    </div>
  );
}

/* Channel glyphs — generic, geometric, not brand marks. */
type GlyphProps = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ChannelGlyph = {
  WEBSITE: (p: GlyphProps) => (
    <svg {...base} {...p}>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <path d="M3 9h18" />
      <circle cx="6.2" cy="6.8" r=".5" fill="currentColor" />
      <circle cx="8.3" cy="6.8" r=".5" fill="currentColor" />
      <path d="M8 14.5h5M8 16.8h3" />
      <path d="M15.2 13.2 18 15l-2.8 1.8" />
    </svg>
  ),
  TELEGRAM: (p: GlyphProps) => (
    <svg {...base} {...p}>
      <path d="M20.5 4.2 3.6 10.8c-.8.3-.8 1.4 0 1.7l4 1.4 1.6 5.1c.2.7 1.1.9 1.6.4l2.3-2.2 4.2 3.1c.6.4 1.4.1 1.6-.6l2.9-14.3c.2-.9-.6-1.5-1.3-1.2Z" />
      <path d="m7.6 13.9 9.2-6-6.6 7.1" />
    </svg>
  ),
  WHATSAPP: (p: GlyphProps) => (
    <svg {...base} {...p}>
      <path d="M4.3 19.7 5.4 16A8.3 8.3 0 1 1 8 18.6Z" />
      <path d="M9.4 8.6c.2-.4.5-.4.8-.4h.4c.2 0 .4.1.5.4l.6 1.4c.1.3 0 .5-.1.7l-.4.5c-.1.2-.1.4 0 .6.6 1 1.4 1.8 2.4 2.3.2.1.4.1.6-.1l.5-.5c.2-.2.4-.2.7-.1l1.3.6c.3.1.4.3.4.6v.3c0 .4-.2.8-.6 1-.6.3-1.3.4-2 .2-2.4-.7-4.2-2.5-5-4.9-.2-.9-.1-1.8.3-2.6Z" />
    </svg>
  ),
  EMAIL: (p: GlyphProps) => (
    <svg {...base} {...p}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7.5 6.6 5a2.3 2.3 0 0 0 2.8 0L20 7.5" />
    </svg>
  ),
  WEBHOOK: (p: GlyphProps) => (
    <svg {...base} {...p}>
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="17.5" cy="17" r="2.5" />
      <circle cx="12" cy="6.5" r="2.5" />
      <path d="M10.8 8.7 7.6 14.8M9 17h6M13.2 8.7l3.2 6.1" />
    </svg>
  ),
};

/** Circular progress ring. `value` is 0–100. */
export function Ring({ value, size = 56, stroke = 5, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ringTrack" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ringValue"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ ["--len" as string]: `${c}` }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span className="ringLabel">{children}</span>}
    </div>
  );
}
