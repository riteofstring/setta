import type { EasyButtonPaneConfig } from "@generated/backend";

import type { NonEasyButtonSurfaceKind, WorkspacePane, OpenPaneRequest } from "./types";

type WorkspacePaneSurface =
  | { easyButtonConfig: EasyButtonPaneConfig; surfaceKind: "easy-button" }
  | { surfaceKind: NonEasyButtonSurfaceKind };

export function paneSurfaceForRequest(
  request: OpenPaneRequest,
  existing?: WorkspacePane,
): WorkspacePaneSurface {
  const surfaceKind = request.surfaceKind ?? existing?.surfaceKind;
  const requestConfig = request.easyButtonConfig as EasyButtonPaneConfig | undefined;
  if (request.surfaceKind !== "easy-button" && requestConfig) {
    throw new Error("easyButtonConfig requires an explicit easy-button surfaceKind");
  }
  if (surfaceKind === "easy-button") {
    const config = resolvedEasyButtonConfig(request, existing);
    validateEasyButtonConfig(config);
    return { easyButtonConfig: config, surfaceKind };
  }
  return { surfaceKind: surfaceKind ?? "empty-frame" };
}

function resolvedEasyButtonConfig(
  request: OpenPaneRequest,
  existing: WorkspacePane | undefined,
): EasyButtonPaneConfig | undefined {
  if (request.surfaceKind === "easy-button") {
    return request.easyButtonConfig;
  }
  if (existing?.surfaceKind === "easy-button") {
    return existing.easyButtonConfig;
  }
  return undefined;
}

function validateEasyButtonConfig(
  config: EasyButtonPaneConfig | undefined,
): asserts config is EasyButtonPaneConfig {
  if (!config) {
    throw new Error("easy-button panes require an easyButtonConfig conversation binding");
  }
  if (config.conversationId.length === 0) {
    throw new Error("easyButtonConfig.conversationId is required");
  }
  if (config.conversationId.trim() !== config.conversationId) {
    throw new Error("easyButtonConfig.conversationId must not have surrounding whitespace");
  }
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
