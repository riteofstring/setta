export function normalizeSurfaceId(surfaceId: string): string {
  if (!surfaceId) {
    throw new Error("Retained texture page requires surfaceId.");
  }
  return surfaceId;
}

export function normalizeScaleKey(scaleKey: string): string {
  if (!scaleKey) {
    throw new Error("Retained texture page requires scaleKey.");
  }
  return scaleKey;
}

export function normalizeSourceKey(sourceKey: string): string {
  if (!sourceKey) {
    throw new Error("Retained texture page requires sourceKey.");
  }
  return sourceKey;
}

export function normalizeFiniteNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Retained texture page ${name} must be finite.`);
  }
  return value;
}

export function normalizeFinitePositiveNumber(
  name: string,
  value: number,
): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (normalized <= 0) {
    throw new Error(`Retained texture page ${name} must be greater than zero.`);
  }
  return normalized;
}

export function normalizeFinitePositiveInteger(
  name: string,
  value: number,
): number {
  const normalized = normalizeFinitePositiveNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Retained texture page ${name} must be an integer.`);
  }
  return normalized;
}

export function normalizeFiniteInteger(name: string, value: number): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Retained texture page ${name} must be an integer.`);
  }
  return normalized;
}

export function normalizeFiniteNonNegativeInteger(
  name: string,
  value: number,
): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(
      `Retained texture page ${name} must be a non-negative integer.`,
    );
  }
  return normalized;
}

export function normalizeRetiredFrameThrough(value: number): number {
  if (value === Number.POSITIVE_INFINITY) {
    return value;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      "Retained texture page retiredFrameThrough must be finite, non-negative, or positive infinity.",
    );
  }
  return value;
}
