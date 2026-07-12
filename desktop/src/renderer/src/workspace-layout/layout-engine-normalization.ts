import type { WorkspacePane, OpenPaneRequest } from "./types";

export function easyButtonConfigForRequest(
  request: OpenPaneRequest,
  existing?: WorkspacePane,
): WorkspacePane["easyButtonConfig"] {
  const surfaceKind = request.surfaceKind ?? existing?.surfaceKind;
  if (surfaceKind !== "easy-button") {
    return undefined;
  }
  return request.easyButtonConfig ?? existing?.easyButtonConfig;
}

export function normalizedPaneWeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0.1, value) : 1;
}

export function normalizedPaneHeightPx(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number.isFinite(value) ? Math.max(96, Math.round(value)) : null;
}
