/** Vector redraw of the Lemiri mark: the "L" stem, the dialogue dot and the answering half-moon. */
export function LemiriGlyph({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`lemiriGlyph ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path className="lg-stem" d="M5 36V4.5A10.5 10.5 0 0 1 15.5 15v21Z" />
      <path className="lg-foot" d="M5 26h13.2c5.6 0 8.6 3.9 12 10H5Z" />
      <circle className="lg-dot" cx="22.6" cy="16.4" r="4.6" />
      <path className="lg-moon" d="M35.5 14.2v15.6a7.8 7.8 0 0 1 0-15.6Z" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "logo compact" : "logo"} aria-label="Lemiri AI" role="img">
      <LemiriGlyph size={compact ? 30 : 28} />
      {!compact && (
        <span className="logoWord" aria-hidden="true">
          Lemiri<em>AI</em>
        </span>
      )}
    </div>
  );
}
