import { useActiveSections, useWorkspaceDocument } from "./stores";
import type { WorkspaceDocument } from "./types";

// The change-callback half of the Phase 2 controlled-document boundary. The reference pairs
// every canonical write with a backend route (per-flag routes, `moveSectionsWithBackend`,
// `setSectionSizes`, the debounced layout/viewport/active-ids sends); the package instead
// invokes one host callback with the full serializable document after each canonical commit.
// Debouncing is transport policy and stays host-side: the reference mirrors canonical state
// immediately and debounces only its network sends.

export type WorkspaceDocumentChangeCallback = (
  document: WorkspaceDocument,
) => void;

let documentChangeCallback: WorkspaceDocumentChangeCallback | null = null;
let suppressionDepth = 0;
let notifying = false;

export function setWorkspaceDocumentChangeCallback(
  callback: WorkspaceDocumentChangeCallback | null,
): void {
  documentChangeCallback = callback;
}

// A serializable snapshot of the canonical workspace document. Store slices are shared, not
// cloned — treat the returned document as immutable. Reads go through the patched getState, so
// a snapshot taken during an atomic publication observes the staged state consistently.
export function getWorkspaceDocument(): WorkspaceDocument {
  const documentState = useWorkspaceDocument.getState();
  return {
    sections: documentState.sections,
    topLevelSections: documentState.topLevelSections,
    viewport: documentState.viewport,
    activeIds: useActiveSections.getState().activeIds,
  };
}

// Host-initiated writes (`loadWorkspaceDocument`) suppress notification: the callback reports
// package-initiated canonical changes, not echoes of the host's own document.
export function runWithWorkspaceDocumentChangeNotificationsSuppressed(
  fn: () => void,
): void {
  suppressionDepth += 1;
  try {
    fn();
  } finally {
    suppressionDepth -= 1;
  }
}

export function notifyWorkspaceDocumentChange(): void {
  if (suppressionDepth > 0 || documentChangeCallback === null) {
    return;
  }
  if (notifying) {
    throw new Error(
      "The workspace document-change callback mutated the workspace synchronously. " +
        "Apply host reactions asynchronously to avoid a notification feedback loop.",
    );
  }
  notifying = true;
  try {
    documentChangeCallback(getWorkspaceDocument());
  } finally {
    notifying = false;
  }
}
