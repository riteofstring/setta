import type { OpenPaneRequest } from "./types";

export const niriOpenPaneRequestEvent = "setta:niri-open-pane-request";

export function requestNiriPaneOpen(request: OpenPaneRequest): void {
  window.dispatchEvent(
    new CustomEvent<OpenPaneRequest>(niriOpenPaneRequestEvent, {
      detail: request,
    }),
  );
}
