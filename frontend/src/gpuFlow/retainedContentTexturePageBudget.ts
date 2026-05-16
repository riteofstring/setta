import {
  normalizeRetainedTextureBudget,
  type RetainedTextureBudget,
} from "./retainedTextureBudget";
import type { RetainedTextureUploadSchedulerBudget } from "./retainedTextureUploadScheduler";

export function normalizeRetainedContentTexturePageBudget(
  budget: RetainedTextureUploadSchedulerBudget,
): RetainedTextureUploadSchedulerBudget {
  return {
    maxFrameRasterMs: normalizeFiniteNonNegativeNumber(
      "maxFrameRasterMs",
      budget.maxFrameRasterMs,
    ),
    maxFrameUploadMs: normalizeFiniteNonNegativeNumber(
      "maxFrameUploadMs",
      budget.maxFrameUploadMs,
    ),
    maxFrameUploadedBytes: normalizeFiniteNonNegativeNumber(
      "maxFrameUploadedBytes",
      budget.maxFrameUploadedBytes,
    ),
    maxTextureMemoryBytes: normalizeFiniteNonNegativeNumber(
      "maxTextureMemoryBytes",
      budget.maxTextureMemoryBytes,
    ),
    maxUploads: normalizeFiniteNonNegativeInteger(
      "maxUploads",
      budget.maxUploads,
    ),
  };
}

export function resolveRetainedContentTexturePageTextureBudget({
  defaultMaxTextureMemoryBytes,
  schedulerBudget,
  textureBudget,
}: {
  readonly defaultMaxTextureMemoryBytes: number;
  readonly schedulerBudget?:
    | Partial<RetainedTextureUploadSchedulerBudget>
    | undefined;
  readonly textureBudget?: Partial<RetainedTextureBudget> | undefined;
}): RetainedTextureBudget {
  return normalizeRetainedTextureBudget({
    hardMaxBytes:
      textureBudget?.hardMaxBytes ??
      schedulerBudget?.maxTextureMemoryBytes ??
      defaultMaxTextureMemoryBytes,
    ...textureBudget,
  });
}

export function normalizeRetainedContentTexturePageLodScale({
  devicePixelRatio,
  viewportZoomBucket,
}: {
  readonly devicePixelRatio: number;
  readonly viewportZoomBucket: number;
}): number {
  return (
    normalizeFinitePositiveNumber("devicePixelRatio", devicePixelRatio) *
    normalizeFinitePositiveNumber("viewportZoomBucket", viewportZoomBucket)
  );
}

function normalizeFiniteNonNegativeNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Retained content texture page manager ${name} must be finite and non-negative.`,
    );
  }
  return value;
}

function normalizeFinitePositiveNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Retained content texture page manager ${name} must be finite and positive.`,
    );
  }
  return value;
}

function normalizeFiniteNonNegativeInteger(
  name: string,
  value: number,
): number {
  const normalized = normalizeFiniteNonNegativeNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(
      `Retained content texture page manager ${name} must be an integer.`,
    );
  }
  return normalized;
}
