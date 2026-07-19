import {
  isMasterPaneFocusShortcut,
  masterPaneFocusShortcutLabel,
} from "../features/global-master/master-shortcuts";

export { isMasterPaneFocusShortcut, masterPaneFocusShortcutLabel };

export const masterPaneFocusRequestEvent = "setta:master-pane-focus-request";

export type MasterPaneFocusRequestSource = "chrome" | "keyboard" | "native-key";

export interface MasterPaneFocusRequestDetail {
  requestId: number;
  source: MasterPaneFocusRequestSource;
}

let nextMasterPaneFocusRequestId = 1;
let pendingMasterPaneFocusRequest: MasterPaneFocusRequestDetail | null = null;

export function requestMasterPaneFocus(
  source: MasterPaneFocusRequestSource,
): MasterPaneFocusRequestDetail | null {
  if (typeof window === "undefined") {
    return null;
  }
  const detail = {
    requestId: nextMasterPaneFocusRequestId,
    source,
  } satisfies MasterPaneFocusRequestDetail;
  nextMasterPaneFocusRequestId += 1;
  pendingMasterPaneFocusRequest = detail;
  window.dispatchEvent(new CustomEvent(masterPaneFocusRequestEvent, { detail }));
  return detail;
}

export function consumePendingMasterPaneFocusRequest(): MasterPaneFocusRequestDetail | null {
  const request = pendingMasterPaneFocusRequest;
  pendingMasterPaneFocusRequest = null;
  return request;
}

export function markMasterPaneFocusRequestHandled(requestId: number): void {
  if (pendingMasterPaneFocusRequest?.requestId === requestId) {
    pendingMasterPaneFocusRequest = null;
  }
}

export function masterPaneFocusRequestDetail(event: Event): MasterPaneFocusRequestDetail | null {
  const detail = (event as CustomEvent<MasterPaneFocusRequestDetail>).detail;
  if (
    !detail ||
    typeof detail.requestId !== "number" ||
    !validMasterPaneFocusRequestSource(detail.source)
  ) {
    return null;
  }
  return detail;
}

function validMasterPaneFocusRequestSource(
  source: unknown,
): source is MasterPaneFocusRequestSource {
  return source === "chrome" || source === "keyboard" || source === "native-key";
}

export function focusMasterPaneComposer(root: HTMLElement): void {
  const focus = () => {
    const masterHost = root.querySelector<HTMLElement>(
      '[data-testid="workspace-pane-host"][data-surface-kind="master"][data-visible="true"]',
    );
    const composer = masterHost?.querySelector<HTMLTextAreaElement>(
      '[data-testid="master-pane-surface"] textarea[aria-label="Ask Setta"]',
    );
    composer?.focus({ preventScroll: true });
  };
  queueMicrotask(focus);
  window.requestAnimationFrame?.(focus);
  window.setTimeout(focus, 0);
}
