export type RetainedTextureBudget = {
  readonly activeIslandReserveBytes: number;
  readonly hardMaxBytes: number;
  readonly nearViewportReserveBytes: number;
  readonly offscreenPrefetchMaxBytes: number;
  readonly visibleReserveBytes: number;
};

export const DEFAULT_RETAINED_TEXTURE_BUDGET: RetainedTextureBudget =
  Object.freeze({
    activeIslandReserveBytes: 24 * 1024 * 1024,
    hardMaxBytes: 192 * 1024 * 1024,
    nearViewportReserveBytes: 48 * 1024 * 1024,
    offscreenPrefetchMaxBytes: 8 * 1024 * 1024,
    visibleReserveBytes: 96 * 1024 * 1024,
  });

export function normalizeRetainedTextureBudget(
  budget: Partial<RetainedTextureBudget> = {},
  defaults: RetainedTextureBudget = DEFAULT_RETAINED_TEXTURE_BUDGET,
): RetainedTextureBudget {
  const resolved = {
    ...defaults,
    ...budget,
  };
  return Object.freeze({
    activeIslandReserveBytes: normalizeFiniteNonNegativeNumber(
      "activeIslandReserveBytes",
      resolved.activeIslandReserveBytes,
    ),
    hardMaxBytes: normalizeFiniteNonNegativeNumber(
      "hardMaxBytes",
      resolved.hardMaxBytes,
    ),
    nearViewportReserveBytes: normalizeFiniteNonNegativeNumber(
      "nearViewportReserveBytes",
      resolved.nearViewportReserveBytes,
    ),
    offscreenPrefetchMaxBytes: normalizeFiniteNonNegativeNumber(
      "offscreenPrefetchMaxBytes",
      resolved.offscreenPrefetchMaxBytes,
    ),
    visibleReserveBytes: normalizeFiniteNonNegativeNumber(
      "visibleReserveBytes",
      resolved.visibleReserveBytes,
    ),
  });
}

function normalizeFiniteNonNegativeNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Retained texture budget ${name} must be finite and non-negative.`,
    );
  }
  return value;
}
