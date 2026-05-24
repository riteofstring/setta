import type { Page } from "@playwright/test";

import type { RetainedRowDebugEntry } from "./settings-retained-visual-analysis";

export type RetainedContentScrollMarker = {
  readonly marker: number;
  readonly visibleRows: readonly {
    readonly label: string;
    readonly y: number;
  }[];
};

export async function readVisibleRetainedContentScrollMarker(
  page: Page,
  {
    labelOrder,
    surfaceId,
  }: {
    readonly labelOrder: readonly string[];
    readonly surfaceId: string;
  },
): Promise<RetainedContentScrollMarker> {
  return await page.evaluate(
    ({ labelOrder: pageLabelOrder, surfaceId: pageSurfaceId }) => {
      const orderByLabel = new Map(
        pageLabelOrder.map((label, index) => [label, index]),
      );
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === pageSurfaceId &&
            orderByLabel.has(row.rowLabel) &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.clientRect.y < window.innerHeight &&
            row.clientRect.y + row.clientRect.height > 0,
        )
        .sort((left, right) => left.clientRect.y - right.clientRect.y);
      if (rows.length < 3) {
        throw new Error(
          `Missing enough visible retained rows for scroll marker: ${JSON.stringify(
            rows.map((row) => row.rowLabel),
          )}`,
        );
      }
      const rowHeight = median(rows.map((row) => row.clientRect.height));
      const markers = rows.map((row) => {
        const order = orderByLabel.get(row.rowLabel);
        if (order === undefined) {
          throw new Error(`Missing retained row order for ${row.rowLabel}.`);
        }
        return order * rowHeight - row.clientRect.y;
      });
      return {
        marker: median(markers),
        visibleRows: rows.map((row) => ({
          label: row.rowLabel,
          y: row.clientRect.y,
        })),
      };

      function median(values: readonly number[]): number {
        if (values.length === 0) {
          return 0;
        }
        const sorted = [...values].sort((left, right) => left - right);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      }
    },
    {
      labelOrder,
      surfaceId,
    },
  );
}
