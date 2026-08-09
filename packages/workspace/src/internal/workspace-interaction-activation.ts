import type { InteractionInput, InteractionOwner } from "./interaction-owner.js";
import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";

/**
 * Gesture-scoped activation state that changes on every interaction start and
 * finish. It lives in an external store, not React context, so a drag start
 * notifies only the narrow per-section and per-handle subscribers whose
 * derived primitives actually changed instead of rerendering every recursive
 * frame. Ownership transitions stay with useWorkspaceInteractionOwner; this
 * store mirrors them synchronously inside the same input dispatch.
 */
export type WorkspaceInteractionActivationSnapshot = Readonly<{
  activeInput: InteractionInput | null;
  activeItemTreeId: string | null;
  activeSectionId: string | null;
  activeSectionMode: WorkspaceSectionMoveMode | null;
  owner: InteractionOwner | null;
  phase: "active" | "idle";
}>;

export const IDLE_INTERACTION_ACTIVATION: WorkspaceInteractionActivationSnapshot = {
  activeInput: null,
  activeItemTreeId: null,
  activeSectionId: null,
  activeSectionMode: null,
  owner: null,
  phase: "idle",
};

export class WorkspaceInteractionActivationStore {
  readonly #listeners = new Set<() => void>();
  #announcement = "";
  #gating = IDLE_INTERACTION_ACTIVATION;
  #snapshot = IDLE_INTERACTION_ACTIVATION;

  /** Last published snapshot; the stable read for React subscribers. */
  getSnapshot = (): WorkspaceInteractionActivationSnapshot => this.#snapshot;

  /**
   * Latest staged snapshot for imperative activation gating. It may lead the
   * published snapshot by one presentation frame during a gesture start.
   */
  getGatingSnapshot = (): WorkspaceInteractionActivationSnapshot => this.#gating;

  /** Structural-movement live-region text; its own channel so an announce
   * never publishes a staged ownership transition early. */
  getAnnouncement = (): string => this.#announcement;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Stage a transition for gating without notifying React subscribers yet. */
  stage(snapshot: WorkspaceInteractionActivationSnapshot): void {
    this.#gating = snapshot;
  }

  /** Publish the staged snapshot to subscribers if it is still unpublished. */
  publishStaged(): void {
    if (this.#snapshot !== this.#gating) {
      this.publish(this.#gating);
    }
  }

  publish(snapshot: WorkspaceInteractionActivationSnapshot): void {
    this.#gating = snapshot;
    this.#snapshot = snapshot;
    this.#notify();
  }

  announce(announcement: string): void {
    this.#announcement = announcement;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** Permanently idle store for standalone surfaces outside a workbench. */
export const IDLE_WORKSPACE_INTERACTION_ACTIVATION_STORE =
  new WorkspaceInteractionActivationStore();

export function sectionStructureActivationAllowed(
  snapshot: WorkspaceInteractionActivationSnapshot,
): boolean {
  return snapshot.phase === "idle";
}

export function itemTreeActivationEnabled(
  snapshot: WorkspaceInteractionActivationSnapshot,
): boolean {
  return snapshot.phase === "idle" || snapshot.owner === "item-tree";
}

export function rootLayoutInteractionActive(
  snapshot: WorkspaceInteractionActivationSnapshot,
): boolean {
  return snapshot.owner === "root-layout";
}

export function sectionStructureInteractionActive(
  snapshot: WorkspaceInteractionActivationSnapshot,
): boolean {
  return snapshot.owner === "section-structure";
}

export function viewportInteractionEnabled(
  snapshot: WorkspaceInteractionActivationSnapshot,
): boolean {
  return snapshot.phase === "idle" || snapshot.owner === "viewport";
}
