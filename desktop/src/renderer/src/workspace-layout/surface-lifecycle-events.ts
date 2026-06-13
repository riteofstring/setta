import type { ResumeReason, SurfaceId, SurfaceKind } from "./types";

const workspaceSurfaceResumedEvent = "setta:workspace-surface-resumed";

export interface WorkspaceSurfaceResumedDetail {
  reason: ResumeReason;
  surfaceId: SurfaceId;
  surfaceKind: SurfaceKind;
}

export function notifyWorkspaceSurfaceResumed(detail: WorkspaceSurfaceResumedDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new window.CustomEvent<WorkspaceSurfaceResumedDetail>(workspaceSurfaceResumedEvent, {
      detail,
    }),
  );
}

export function subscribeWorkspaceSurfaceResumed(
  handler: (detail: WorkspaceSurfaceResumedDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    if (event instanceof CustomEvent) {
      handler(event.detail as WorkspaceSurfaceResumedDetail);
    }
  };
  window.addEventListener(workspaceSurfaceResumedEvent, listener);
  return () => {
    window.removeEventListener(workspaceSurfaceResumedEvent, listener);
  };
}
