export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "logo compact" : "logo"}>
    <img src={compact ? "/brand/lemiri-mark.png" : "/brand/lemiri-wordmark.png"} alt="Lemiri AI" width={compact ? 38 : 164} height={compact ? 38 : 48} />
  </div>;
}
