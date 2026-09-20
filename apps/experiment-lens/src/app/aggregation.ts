export type LensAggregation = "count" | "mean" | "min" | "max" | "median";

export type HistogramBin = Readonly<{
  count: number;
  maximum: number;
  minimum: number;
}>;

export function aggregateValues(
  values: readonly number[],
  aggregation: LensAggregation,
): number | null {
  if (aggregation === "count") {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  if (aggregation === "min") {
    return Math.min(...values);
  }
  if (aggregation === "max") {
    return Math.max(...values);
  }
  if (aggregation === "mean") {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? upper) + upper) / 2
    : upper;
}
