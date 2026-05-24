import { DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES } from "gpuFlow/htmlSurfaces/textureTiles";

export const PROJECT_GPU_NODE_UPLOAD_BUDGET = {
  maxBytes: DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES,
  maxDurationMs: 4,
  maxUploads: 2,
} as const;

export const PROJECT_GPU_NODE_TEXTURE_TILE_DIMENSION_PX = 256;
