// Pure helper for the admin «Кто использует ИИ-продавца» list (usage.ts): merges the
// sites where a card was seen with the sites the customer allowed. No imports — tested
// with node directly.

export type UsageDomain = { origin: string; host: string; lastSeenAt: string | null; allowed: boolean };

const hostOf = (origin: string) => { try { return new URL(origin).host; } catch { return origin; } };

/** Merges seen and allowed origins of one card, newest first; Lemeri's own hosts are skipped. */
export function usageDomains(config: { allowedOrigins?: unknown[]; seen?: Record<string, unknown> } | null, ownHosts: string[] = []): UsageDomain[] {
  const byHost = new Map<string, UsageDomain>();
  for (const [origin, at] of Object.entries(config?.seen ?? {})) {
    if (typeof at !== "number") continue;
    const host = hostOf(origin);
    if (ownHosts.includes(host)) continue;
    const prev = byHost.get(host);
    if (!prev || (prev.lastSeenAt ?? "") < new Date(at).toISOString()) byHost.set(host, { origin, host, lastSeenAt: new Date(at).toISOString(), allowed: prev?.allowed ?? false });
  }
  for (const origin of config?.allowedOrigins ?? []) {
    if (typeof origin !== "string" || !origin) continue;
    const host = hostOf(origin);
    if (ownHosts.includes(host)) continue;
    const prev = byHost.get(host);
    byHost.set(host, prev ? { ...prev, allowed: true } : { origin, host, lastSeenAt: null, allowed: true });
  }
  return [...byHost.values()].sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || a.host.localeCompare(b.host));
}

