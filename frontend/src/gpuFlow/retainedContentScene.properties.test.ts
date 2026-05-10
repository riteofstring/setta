import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGpuRetainedRowContentScene,
  resolveGpuRetainedContentVisibleRowRange,
  type GpuRetainedContentRowInput,
} from "./retainedContentScene";
import { row } from "./retainedContentScene.helpers.test";

const RETAINED_CONTENT_PROPERTY_RUNS = 100;

describe("retained content scene diagnostics and properties", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records retained scene rebuild diagnostics when a probe is installed", () => {
    const recordSceneBuild = vi.fn();
    vi.stubGlobal("window", {
      __SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__: { recordSceneBuild },
    });

    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      overscanRows: 1,
      rowHeight: 20,
      rows: Array.from({ length: 50 }, (_, index) => row(`param-${index}`)),
      scrollOffset: { x: 0, y: 80 },
      viewportRect: { height: 60, width: 240, x: 0, y: 0 },
    });

    expect(recordSceneBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        activePopup: false,
        hitRecordCount: scene.hitRecords.length,
        rowCount: 50,
        sceneId: "surface-a",
        visibleRowCount: scene.rows.length,
      }),
    );
    const sample = recordSceneBuild.mock.calls[0]?.[0];
    expect(sample.durationMs).toBeGreaterThanOrEqual(0);
    expect(sample.hitRecordBuildDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps generated visible row ranges clamped and monotonic", () => {
    fc.assert(
      fc.property(
        fc.record({
          overscanRows: fc.integer({ max: 8, min: 0 }),
          rowCount: fc.integer({ max: 2_000, min: 0 }),
          rowHeight: fc.double({
            max: 80,
            min: 1,
            noDefaultInfinity: true,
            noNaN: true,
          }),
          scrollOffsetY: fc.double({
            max: 100_000,
            min: 0,
            noDefaultInfinity: true,
            noNaN: true,
          }),
          viewportHeight: fc.double({
            max: 2_000,
            min: 0,
            noDefaultInfinity: true,
            noNaN: true,
          }),
        }),
        ({
          overscanRows,
          rowCount,
          rowHeight,
          scrollOffsetY,
          viewportHeight,
        }) => {
          const range = resolveGpuRetainedContentVisibleRowRange({
            overscanRows,
            rowCount,
            rowHeight,
            scrollOffsetY,
            viewportHeight,
          });

          expect(range.rowCount).toBe(rowCount);
          expect(range.startIndex).toBeGreaterThanOrEqual(0);
          expect(range.startIndex).toBeLessThanOrEqual(range.endIndex);
          expect(range.endIndex).toBeLessThanOrEqual(rowCount);
        },
      ),
      { numRuns: RETAINED_CONTENT_PROPERTY_RUNS },
    );
  });

  it("includes vertically gapped rows intersecting the overscanned window", () => {
    fc.assert(
      fc.property(
        fc.record({
          gaps: fc.array(fc.integer({ max: 12, min: 0 }), {
            maxLength: 40,
            minLength: 1,
          }),
          overscanRows: fc.integer({ max: 4, min: 0 }),
          rowHeight: fc.integer({ max: 48, min: 12 }),
          scrollOffsetY: fc.integer({ max: 1_000, min: 0 }),
          viewportHeight: fc.integer({ max: 300, min: 1 }),
        }),
        ({ gaps, overscanRows, rowHeight, scrollOffsetY, viewportHeight }) => {
          const inputRows = gaps.map((gap, index) =>
            row(`param-${index}`, { verticalGapBefore: gap }),
          );
          const scene = createGpuRetainedRowContentScene({
            id: "surface-a",
            ownerSectionId: "section-a",
            overscanRows,
            rowHeight,
            rows: inputRows,
            scrollOffset: { x: 0, y: scrollOffsetY },
            viewportRect: { height: viewportHeight, width: 240, x: 0, y: 0 },
          });
          const visibleIds = new Set(
            scene.rows.map((visibleRow) => visibleRow.id),
          );
          const overscanPx = Math.floor(overscanRows) * rowHeight;
          const visibleTop = Math.max(0, scrollOffsetY - overscanPx);
          const visibleBottom = scrollOffsetY + viewportHeight + overscanPx;

          for (const metric of computeRowMetrics(inputRows, rowHeight)) {
            const rowEnd = metric.y + rowHeight;
            const intersectsOverscan =
              rowEnd >= visibleTop && metric.y <= visibleBottom;
            if (intersectsOverscan) {
              expect(visibleIds.has(metric.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: RETAINED_CONTENT_PROPERTY_RUNS },
    );
  });
});

function computeRowMetrics(
  rows: readonly GpuRetainedContentRowInput[],
  rowHeight: number,
): readonly { readonly id: string; readonly y: number }[] {
  let y = 0;
  return rows.map((retainedRow) => {
    y += retainedRow.verticalGapBefore ?? 0;
    const metric = { id: retainedRow.id, y };
    y += rowHeight;
    return metric;
  });
}
