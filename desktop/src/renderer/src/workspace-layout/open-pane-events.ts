import type { NonEasyButtonSurfaceKind, OpenPaneRequest } from "./types";

export const workspaceOpenPaneRequestEvent = "setta:workspace-open-pane-request";
export const rejectedEasyButtonOpenPaneRequestReason =
  "Easy Button panes require a conversation navigation request.";

export type WorkspaceSurfaceOpenPaneRequest = OpenPaneRequest & {
  easyButtonConfig?: never;
  surfaceKind: NonEasyButtonSurfaceKind;
};

export type WorkspaceOpenPaneRequestResolution =
  | {
      kind: "accepted";
      request: WorkspaceSurfaceOpenPaneRequest;
      surfaceKind: NonEasyButtonSurfaceKind;
    }
  | { kind: "ignored" }
  | { kind: "rejected"; reason: string };

export function resolveWorkspaceOpenPaneRequest(
  request: OpenPaneRequest | null | undefined,
): WorkspaceOpenPaneRequestResolution {
  if (!request?.surfaceKind) {
    return { kind: "ignored" };
  }
  if (request.surfaceKind === "easy-button") {
    return { kind: "rejected", reason: rejectedEasyButtonOpenPaneRequestReason };
  }
  return {
    kind: "accepted",
    request: request as WorkspaceSurfaceOpenPaneRequest,
    surfaceKind: request.surfaceKind,
  };
}
