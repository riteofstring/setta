import type { SurfaceGenerationId, SurfaceId } from "./surfaceGeneration";

type SurfaceWorkPriority =
  | "interactive-visible"
  | "visible-edge"
  | "visible-refinement"
  | "idle-refinement";

type SurfaceWorkKind =
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

export function createSurfaceWorkRequest(
  input: SurfaceWorkRequest,
): SurfaceWorkRequest {
  return Object.freeze({ ...input });
}
