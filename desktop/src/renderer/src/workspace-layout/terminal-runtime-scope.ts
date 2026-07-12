import type { useRuntimeStore } from "../stores/runtime-store";

export function runtimeProfileScopeKey(
  snapshot: ReturnType<typeof useRuntimeStore.getState>["snapshot"],
): string {
  return `${snapshot?.activeRuntimeId ?? "unknown"}:${snapshot?.connection.status ?? "unknown"}`;
}
