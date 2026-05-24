import type { Page } from "@playwright/test";

export type PageRafCadence = {
  readonly count: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
};

export async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

export async function measurePageRafCadence(
  page: Page,
): Promise<PageRafCadence> {
  return await page.evaluate(async () => {
    const timestamps: number[] = [];
    await new Promise<void>((resolve) => {
      const sample = (timestamp: number) => {
        timestamps.push(timestamp);
        if (timestamps.length >= 24) {
          resolve();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const intervals = timestamps
      .slice(1)
      .map((timestamp, index) => timestamp - (timestamps[index] ?? timestamp));
    const sortedIntervals = [...intervals].sort((left, right) => left - right);
    return {
      count: intervals.length,
      maxMs: sortedIntervals[sortedIntervals.length - 1] ?? 0,
      p50Ms: pagePercentile(sortedIntervals, 0.5),
      p95Ms: pagePercentile(sortedIntervals, 0.95),
    };

    function pagePercentile(
      sortedValues: readonly number[],
      quantile: number,
    ): number {
      if (sortedValues.length === 0) {
        return 0;
      }
      const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
      );
      return sortedValues[index] ?? 0;
    }
  });
}

export function percentile(
  sortedValues: readonly number[],
  quantile: number,
): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
  );
  return sortedValues[index] ?? 0;
}
