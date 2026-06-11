import type { EngineHealth, MemorySummary, SearchMemoryItem } from "@/src/shared/rpc";

export function healthLabel(health: EngineHealth | null) {
  if (health === null) return "Storage health unknown";
  if (health.status === "ready") return "Storage ready";
  if (health.status === "starting") return "Storage starting";
  if (health.status === "degraded") return "Storage degraded";
  return "Storage error";
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toSearchItem(item: MemorySummary | SearchMemoryItem): SearchMemoryItem {
  return {
    ...item,
    snippet: "snippet" in item && typeof item.snippet === "string" ? item.snippet : item.excerpt,
  };
}
