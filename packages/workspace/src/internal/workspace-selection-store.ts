import { deriveWorkspaceParentLookup, type WorkspaceDocument } from "../core.js";
import {
  normalizeWorkspaceSelectionRoots,
  resolveWorkspaceRootSelection,
  resolveWorkspaceStructuralSelection,
} from "./workspace-selection.js";

/**
 * Gesture-hot selection state distributed outside React context. A selection
 * commit happens synchronously inside the pointer-down input dispatch, so it
 * must notify only the narrow per-section and per-surface subscribers whose
 * derived primitives actually changed instead of rerendering the workspace
 * root, the canvas adapter, and every recursive frame. Selection decisions
 * (resolution, visibility reconciliation, rejection) stay with the workspace
 * root; this store is the distribution channel.
 */
export type WorkspaceSelectionSnapshot = Readonly<{
  /** Canvas-initiated selection announcement for the polite live region. */
  announcement: string;
  /** True when the selected root block cannot move spatially. */
  movementBlocked: boolean;
  /** Reconciled selection in document order. */
  sectionIds: readonly string[];
  selected: ReadonlySet<string>;
  /** True when the selected block cannot move structurally. */
  structuralMovementBlocked: boolean;
}>;

export const EMPTY_WORKSPACE_SELECTION: WorkspaceSelectionSnapshot = {
  announcement: "",
  movementBlocked: false,
  sectionIds: [],
  selected: new Set(),
  structuralMovementBlocked: false,
};

export class WorkspaceSelectionStore {
  readonly #listeners = new Set<() => void>();
  #snapshot = EMPTY_WORKSPACE_SELECTION;

  getSnapshot = (): WorkspaceSelectionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  publish(snapshot: WorkspaceSelectionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Publish a canvas selection announcement without changing the selection. */
  announce(announcement: string): void {
    this.publish({ ...this.#snapshot, announcement });
  }
}

function selectionContainsDetachedSection(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
  detachedSectionIds: readonly string[],
): boolean {
  if (detachedSectionIds.length === 0 || selectedSectionIds.length === 0) {
    return false;
  }
  const selectedRoots = new Set(normalizeWorkspaceSelectionRoots(document, selectedSectionIds));
  const parentLookup = deriveWorkspaceParentLookup(document);
  return detachedSectionIds.some((detachedSectionId) => {
    let sectionId: string | null = detachedSectionId;
    while (sectionId !== null) {
      if (selectedRoots.has(sectionId)) {
        return true;
      }
      sectionId = parentLookup.get(sectionId) ?? null;
    }
    return false;
  });
}

/** Derive the published snapshot for a reconciled selection. */
export function deriveWorkspaceSelectionSnapshot(
  document: WorkspaceDocument<unknown>,
  detachedSectionIds: readonly string[],
  sectionIds: readonly string[],
  announcement: string,
): WorkspaceSelectionSnapshot {
  const selected = new Set(sectionIds);
  const activeSelectedRoot = document.rootSections.find(({ sectionId }) => selected.has(sectionId));
  const movement = activeSelectedRoot
    ? resolveWorkspaceRootSelection(document, sectionIds, activeSelectedRoot.sectionId)
    : null;
  const structuralMovement =
    sectionIds.length > 0 ? resolveWorkspaceStructuralSelection(document, sectionIds) : null;
  const detachmentBlocked = selectionContainsDetachedSection(
    document,
    sectionIds,
    detachedSectionIds,
  );
  return {
    announcement,
    movementBlocked: detachmentBlocked || (movement !== null && !movement.allowed),
    sectionIds,
    selected,
    structuralMovementBlocked:
      detachmentBlocked || (structuralMovement !== null && !structuralMovement.allowed),
  };
}
