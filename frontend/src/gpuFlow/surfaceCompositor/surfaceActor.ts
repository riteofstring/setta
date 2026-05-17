import type {
  SurfaceGeneration,
  SurfaceGenerationId,
  SurfaceId,
  SurfaceRendererBucket,
  SurfaceSourceKey,
} from "./surfaceGeneration";

export type SurfaceActorKind =
  | "dom-section"
  | "retained-parameter-content"
  | "dom-control"
  | "edge-label"
  | "selection-overlay"
  | "resize-overlay"
  | "drag-overlay"
  | "active-dom-island"
  | "native-retained-visual";

export type SurfaceSourcePolicy =
  | "none"
  | "layoutsubtree-dom"
  | "retained-display-list"
  | "native-visual";

export type SurfaceActor = {
  readonly currentGenerationId: SurfaceGenerationId | null;
  readonly kind: SurfaceActorKind;
  readonly rendererBucket: SurfaceRendererBucket;
  readonly sourceKey: SurfaceSourceKey | null;
  readonly sourcePolicy: SurfaceSourcePolicy;
  readonly surfaceId: SurfaceId;
};

export type SurfaceActorSnapshot = {
  readonly actor: SurfaceActor;
  readonly generation: SurfaceGeneration;
};

export function createSurfaceActor(input: SurfaceActor): SurfaceActor {
  return Object.freeze({ ...input });
}

export function createSurfaceActorSnapshot(
  input: SurfaceActorSnapshot,
): SurfaceActorSnapshot {
  if (input.actor.surfaceId !== input.generation.surfaceId) {
    throw new Error(
      `Surface actor "${input.actor.surfaceId}" cannot publish generation for "${input.generation.surfaceId}".`,
    );
  }
  if (
    input.actor.currentGenerationId !== null &&
    input.actor.currentGenerationId !== input.generation.generationId
  ) {
    throw new Error(
      `Surface actor "${input.actor.surfaceId}" current generation changed from "${input.actor.currentGenerationId}" to "${input.generation.generationId}" inside one snapshot.`,
    );
  }
  return Object.freeze({
    actor: input.actor,
    generation: input.generation,
  });
}
