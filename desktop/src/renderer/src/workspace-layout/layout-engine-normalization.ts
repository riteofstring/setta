import type {
  NonConversationSurfaceKind,
  WorkspaceConversationPaneConfig,
  WorkspacePane,
  OpenPaneRequest,
} from "./types";

type WorkspacePaneSurface =
  | { conversationConfig: WorkspaceConversationPaneConfig; surfaceKind: "conversation" }
  | { surfaceKind: NonConversationSurfaceKind };

export function paneSurfaceForRequest(
  request: OpenPaneRequest,
  existing?: WorkspacePane,
): WorkspacePaneSurface {
  const surfaceKind = request.surfaceKind ?? existing?.surfaceKind;
  const requestConfig = request.conversationConfig as WorkspaceConversationPaneConfig | undefined;
  if (request.surfaceKind !== "conversation" && requestConfig) {
    throw new Error("conversationConfig requires an explicit conversation surfaceKind");
  }
  if (surfaceKind === "conversation") {
    const config = resolvedConversationConfig(request, existing);
    validateConversationConfig(config);
    return { conversationConfig: config, surfaceKind };
  }
  return { surfaceKind: surfaceKind ?? "empty-frame" };
}

function resolvedConversationConfig(
  request: OpenPaneRequest,
  existing: WorkspacePane | undefined,
): WorkspaceConversationPaneConfig | undefined {
  if (request.surfaceKind === "conversation") {
    return request.conversationConfig;
  }
  if (existing?.surfaceKind === "conversation") {
    return existing.conversationConfig;
  }
  return undefined;
}

function validateConversationConfig(
  config: WorkspaceConversationPaneConfig | undefined,
): asserts config is WorkspaceConversationPaneConfig {
  if (!config) {
    throw new Error("conversation panes require a conversationConfig conversation binding");
  }
  if (config.conversationId.length === 0) {
    throw new Error("conversationConfig.conversationId is required");
  }
  if (config.conversationId.trim() !== config.conversationId) {
    throw new Error("conversationConfig.conversationId must not have surrounding whitespace");
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
