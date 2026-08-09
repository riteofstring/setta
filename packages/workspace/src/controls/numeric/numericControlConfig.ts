export type NumericControlConfig = {
  min: number;
  max: number;
  step: number;
};

// Numeric-control configuration is host-owned. Fail at the public control boundary when it
// cannot describe the reference's bounded, step-based interaction instead of silently choosing
// replacement limits or a replacement step.
export function assertNumericControlConfig(
  controlName: string,
  { min, max, step }: NumericControlConfig,
): void {
  if (!Number.isFinite(min)) {
    throw new Error(`${controlName} requires a finite min value.`);
  }
  if (!Number.isFinite(max)) {
    throw new Error(`${controlName} requires a finite max value.`);
  }
  if (min >= max) {
    throw new Error(`${controlName} requires min to be less than max.`);
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`${controlName} requires a finite step greater than zero.`);
  }
  if (step > max - min) {
    throw new Error(`${controlName} requires step not to exceed max minus min.`);
  }
}

export function clampNumericValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
