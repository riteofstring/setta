import type { DirtyNodeMark, DirtyNodeState } from "../dirtyTracking";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";

export function compareSurfaceIds(left: string, right: string): number {
  return left.localeCompare(right);
}

export function isMissingElementPaintRecordError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "InvalidStateError" &&
    error.message.includes("No cached paint record for element")
  );
}

export function getNow(): number {
  return globalThis.performance.now();
}

const DEFAULT_HTML_SURFACE_TEXTURE_MEMORY_BUDGET_BYTES = 384 * 1024 * 1024;

export function getHtmlSurfaceTextureUsage(): GPUTextureUsageFlags {
  const usage = globalThis.GPUTextureUsage;
  if (!usage) {
    throw new Error("Setta GPU flow requires GPUTextureUsage constants.");
  }
  return usage.TEXTURE_BINDING | usage.COPY_DST | usage.RENDER_ATTACHMENT;
}

export function normalizeTextureBudgetBytes(
  budgetBytes: number | undefined,
): number {
  const resolvedBudgetBytes =
    budgetBytes ?? DEFAULT_HTML_SURFACE_TEXTURE_MEMORY_BUDGET_BYTES;
  if (Number.isNaN(resolvedBudgetBytes) || resolvedBudgetBytes <= 0) {
    throw new Error(
      "Setta GPU flow HTML surface texture memory budget must be greater than zero bytes.",
    );
  }
  return resolvedBudgetBytes;
}

export function shouldStopUploadLoop({
  options,
  startedAt,
  uploadedBytes,
  uploadedTextureCount,
}: {
  readonly options: {
    readonly maxBytes: number;
    readonly maxDurationMs: number;
    readonly maxUploads: number;
    readonly now: () => number;
  };
  readonly startedAt: number;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
}): boolean {
  if (uploadedTextureCount >= options.maxUploads) {
    return true;
  }
  if (uploadedTextureCount > 0 && uploadedBytes >= options.maxBytes) {
    return true;
  }
  return (
    uploadedTextureCount > 0 &&
    options.now() - startedAt >= options.maxDurationMs
  );
}

export function resolveDirtyFlags(
  input: Pick<DirtyNodeMark, "content" | "resolution">,
): { readonly content: boolean; readonly resolution: boolean } {
  return {
    content: input.content ?? (input.resolution === undefined ? true : false),
    resolution: input.resolution ?? false,
  };
}

export function isResolutionOnlyDirtySurface(
  dirtyNode: Pick<DirtyNodeState, "dirtyContent" | "dirtyResolution">,
): boolean {
  return dirtyNode.dirtyResolution && !dirtyNode.dirtyContent;
}

export function shouldDeferDirtySurfaceUpload(
  dirtySurface: Pick<
    DirtyNodeState,
    "dirtyContent" | "dirtyResolution" | "priority"
  > & { readonly nodeId?: string | undefined },
  record:
    | Pick<CommittedHtmlSurfaceTextureSnapshot, "lastUploadFrame">
    | undefined,
  {
    deferSurfaceIds,
    deferPassiveUploads,
    deferResolutionOnly,
  }: {
    readonly deferSurfaceIds?: ReadonlySet<string> | undefined;
    readonly deferPassiveUploads: boolean;
    readonly deferResolutionOnly: boolean;
  },
): boolean {
  if (dirtySurface.nodeId && deferSurfaceIds?.has(dirtySurface.nodeId)) {
    return true;
  }
  if (dirtySurface.priority === "interactive") {
    return false;
  }
  if (!record) {
    return false;
  }
  if (deferPassiveUploads) {
    return true;
  }
  if (record.lastUploadFrame < 0) {
    return false;
  }
  return deferResolutionOnly;
}

export function normalizeSurfaceIdSet(
  surfaceIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!surfaceIds) {
    return new Set();
  }
  if (surfaceIds instanceof Set) {
    return surfaceIds;
  }
  return new Set(surfaceIds);
}
