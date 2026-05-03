export function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampNumber(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
