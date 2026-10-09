import type { z } from "zod";
// Bounded JSON caches contain only public environmental data, never photos or journal records.
export function boundedCache<T>(
  name: string,
  schema: z.ZodType<T>,
  limit: number,
  retention: number,
) {
  type Row = { key: string; at: number; data: T };
  let memory: Row[] = [];
  const prune = (rows: Row[], now: number) =>
    rows
      .filter(
        (r) => Number.isFinite(r.at) && r.at <= now && now - r.at < retention,
      )
      .sort((a, b) => b.at - a.at)
      .filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i)
      .slice(0, limit);
  function read(now: number) {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(name) ?? "[]");
      if (Array.isArray(raw) && raw.length <= limit) {
        const rows: Row[] = [];
        for (const r of raw) {
          if (!r || typeof r.key !== "string" || typeof r.at !== "number")
            continue;
          const parsed = schema.safeParse(r.data);
          if (parsed.success)
            rows.push({ key: r.key, at: r.at, data: parsed.data });
        }
        memory = prune([...memory, ...rows], now);
      }
    } catch {
      /* corrupted or unavailable storage */
    }
    memory = prune(memory, now);
    return memory;
  }
  function persist() {
    try {
      localStorage.setItem(name, JSON.stringify(memory));
    } catch {
      /* bounded memory fallback */
    }
  }
  return {
    entries(now = Date.now()) {
      const rows = read(now);
      persist();
      return rows;
    },
    get(key: string, now = Date.now()) {
      const row = read(now).find((r) => r.key === key);
      persist();
      return row;
    },
    putMany(rows: Row[], now = Date.now()) {
      memory = prune([...rows, ...read(now)], now);
      persist();
    },
    clearMemory() {
      memory = [];
    },
  };
}
