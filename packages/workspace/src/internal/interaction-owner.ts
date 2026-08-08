import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";

export type InteractionInput = "keyboard" | "pointer" | "touch";
export type InteractionSurface =
  "canvas" | "host-content" | "item-handle" | "nested-section-handle" | "root-section-handle";
export type InteractionOwner = "item-tree" | "root-layout" | "section-structure" | "viewport";

export type InteractionOwnershipState = {
  owner: InteractionOwner | null;
  phase: "active" | "idle";
};

export type InteractionActivationPolicy = {
  rootLayoutEnabled: boolean;
  sectionStructureEnabled: boolean;
  viewportEnabled: boolean;
};

export type InteractionStart = {
  input: InteractionInput;
  itemMovementEnabled: boolean;
  layoutEnabled: boolean;
  sectionMode: WorkspaceSectionMoveMode;
  structureEnabled: boolean;
  surface: InteractionSurface;
  viewportOverride: boolean;
};

export type InteractionOwnershipEvent =
  | { type: "cancel" }
  | { type: "complete" }
  | { type: "mode-change"; sectionMode: WorkspaceSectionMoveMode }
  | { type: "start"; request: InteractionStart };

export const IDLE_INTERACTION_OWNERSHIP: InteractionOwnershipState = {
  owner: null,
  phase: "idle",
};

export function transitionInteractionOwnership(
  state: InteractionOwnershipState,
  event: InteractionOwnershipEvent,
): InteractionOwnershipState {
  if (event.type === "cancel" || event.type === "complete") {
    return IDLE_INTERACTION_OWNERSHIP;
  }
  if (event.type === "mode-change") {
    return state;
  }
  if (state.phase === "active") {
    throw new Error(`Interaction owner "${state.owner ?? "unknown"}" is already active.`);
  }

  const owner = resolveStartOwner(event.request);
  return owner ? { owner, phase: "active" } : IDLE_INTERACTION_OWNERSHIP;
}

export function resolveStartOwner(request: InteractionStart): InteractionOwner | null {
  if (request.surface === "host-content") {
    return null;
  }
  if (request.viewportOverride) {
    return "viewport";
  }
  if (request.surface === "canvas") {
    return "viewport";
  }
  if (request.surface === "item-handle") {
    return request.itemMovementEnabled ? "item-tree" : null;
  }
  if (request.surface === "nested-section-handle") {
    return request.structureEnabled ? "section-structure" : null;
  }
  return resolveRootOwner(request);
}

export function resolveInteractionActivationPolicy(
  state: InteractionOwnershipState,
  sectionMode: WorkspaceSectionMoveMode,
): InteractionActivationPolicy {
  const idle = state.phase === "idle";
  return {
    rootLayoutEnabled: state.owner === "root-layout" || (idle && sectionMode === "sort"),
    sectionStructureEnabled: idle,
    viewportEnabled: state.owner === "viewport" || idle,
  };
}

function resolveRootOwner(request: InteractionStart): InteractionOwner | null {
  if (request.sectionMode === "free") {
    return request.structureEnabled ? "section-structure" : null;
  }
  return request.layoutEnabled ? "root-layout" : null;
}
