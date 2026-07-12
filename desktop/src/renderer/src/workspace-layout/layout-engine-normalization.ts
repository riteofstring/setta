import type { WorkspacePane, OpenPaneRequest, TerminalPaneConfig } from "./types";

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

export function terminalConfigForRequest(
  request: OpenPaneRequest,
  existing?: WorkspacePane,
): TerminalPaneConfig | undefined {
  const surfaceKind = request.surfaceKind ?? existing?.surfaceKind;
  if (surfaceKind !== "terminal") {
    return undefined;
  }
  return normalizeTerminalPaneConfig(request.terminalConfig ?? existing?.terminalConfig);
}

export function workflowNodeDetailsConfigForRequest(
  request: OpenPaneRequest,
  existing?: WorkspacePane,
): WorkspacePane["workflowNodeDetailsConfig"] {
  const surfaceKind = request.surfaceKind ?? existing?.surfaceKind;
  if (surfaceKind !== "workflow-node-details") {
    return undefined;
  }
  return request.workflowNodeDetailsConfig ?? existing?.workflowNodeDetailsConfig;
}

export function normalizeTerminalPaneConfig(
  config: TerminalPaneConfig | undefined,
): TerminalPaneConfig {
  return {
    cwdOverride: normalizedOptionalString(config?.cwdOverride),
    profileId: normalizedOptionalString(config?.profileId) ?? "",
    titleOverride: normalizedOptionalString(config?.titleOverride),
  };
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

function normalizedOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
