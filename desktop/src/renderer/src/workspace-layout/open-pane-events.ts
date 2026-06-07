import type { OpenPaneRequest } from "./types";

export const workspaceOpenPaneRequestEvent = "setta:workspace-open-pane-request";

export function requestWorkspacePaneOpen(request: OpenPaneRequest): void {
  window.dispatchEvent(
    new CustomEvent<OpenPaneRequest>(workspaceOpenPaneRequestEvent, {
      detail: request,
    }),
  );
}
