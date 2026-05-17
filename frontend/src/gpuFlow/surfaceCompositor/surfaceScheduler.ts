import type { SurfaceGenerationId, SurfaceId } from "./surfaceGeneration";

export type SurfaceWorkPriority =
  | "interactive-visible"
  | "visible-edge"
  | "visible-refinement"
  | "idle-refinement";

export type SurfaceWorkKind =
  | "paint-readiness"
  | "texture-upload"
  | "retained-raster"
  | "source-invalidation"
  | "dom-island-alignment";

export type SurfaceWorkRequest = {
  readonly generationId: SurfaceGenerationId;
  readonly kind: SurfaceWorkKind;
  readonly priority: SurfaceWorkPriority;
  readonly reason: string;
  readonly surfaceId: SurfaceId;
};

export type SurfaceSchedulerBudget = {
  readonly interactionFrameBudgetMs: number;
  readonly maxUploadBytes: number;
  readonly maxUploads: number;
};

export type SurfaceScheduler = {
  readonly enqueue: (request: SurfaceWorkRequest) => void;
  readonly requestFrame: (reason: string) => void;
};

export function createSurfaceWorkRequest(
  input: SurfaceWorkRequest,
): SurfaceWorkRequest {
  return Object.freeze({ ...input });
}
