import { expect, type Page } from "@playwright/test";

import type { RetainedRowDebugEntry } from "./settings-retained-visual-analysis";

export async function waitForGuiRowHoverState(
  page: Page,
  surfaceId: string,
  expectedLabel: string | null,
): Promise<void> {
  const readHoverLabels = async () =>
    await page.evaluate((surfaceId) => {
      const rowLabelById = new Map(
        (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
          .filter(
            (row): row is RetainedRowDebugEntry => row.surfaceId === surfaceId,
          )
          .map((row) => [row.rowId, row.rowLabel]),
      );
      const hoverPrefix = `${surfaceId}:row-hover:`;
      return (window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? [])
        .filter(
          (surface) =>
            surface.kind === "solid-rounded-rect" &&
            surface.surfaceId.startsWith(hoverPrefix),
        )
        .map((surface) =>
          rowLabelById.get(surface.surfaceId.slice(hoverPrefix.length)),
        )
        .filter((label): label is string => label !== undefined)
        .sort();
    }, surfaceId);
  try {
    await expect
      .poll(readHoverLabels, { timeout: 2_000 })
      .toEqual(expectedLabel === null ? [] : [expectedLabel]);
  } catch (error) {
    const diagnostics = await page.evaluate(
      ({ expectedLabel, surfaceId }) => {
        const rows = (
          window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
        ).filter(
          (row): row is RetainedRowDebugEntry => row.surfaceId === surfaceId,
        );
        const expectedRow =
          rows.find((row) => row.rowLabel === expectedLabel) ?? null;
        const performanceSnapshot = (
          window as Window & {
            readonly __settaGpuFlowPerformanceProbe?: {
              readonly snapshot?: () => {
                readonly nodeLayerFrames?: readonly unknown[];
              };
            };
          }
        ).__settaGpuFlowPerformanceProbe?.snapshot?.();
        const elementAtExpectedPoint = expectedRow
          ? document.elementFromPoint(
              expectedRow.labelClientPoint.x,
              expectedRow.labelClientPoint.y,
            )
          : null;
        const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
        return {
          elementAtExpectedPoint: elementAtExpectedPoint
            ? {
                className: (elementAtExpectedPoint as HTMLElement).className,
                domControl:
                  (elementAtExpectedPoint as HTMLElement).closest(
                    "[data-gpu-flow-dom-control='true']",
                  ) !== null,
                tagName: elementAtExpectedPoint.tagName,
              }
            : null,
          expectedLabel,
          expectedRow,
          hoveredRetainedHit: snapshot?.hoveredRetainedHit ?? null,
          pointer: snapshot?.lastPointer ?? null,
          recentNodeLayerFrames: Array.isArray(
            performanceSnapshot?.nodeLayerFrames,
          )
            ? performanceSnapshot.nodeLayerFrames.slice(-8)
            : [],
          retainedNativeVisuals:
            window.__SETTA_GPU_FLOW_DEBUG_RETAINED_NATIVE_VISUALS__?.() ?? null,
          viewport: snapshot?.viewport ?? null,
          visibleHoverSurfaceIds: (
            window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? []
          )
            .filter(
              (surface) =>
                surface.kind === "solid-rounded-rect" &&
                surface.surfaceId.startsWith(`${surfaceId}:row-hover:`),
            )
            .map((surface) => surface.surfaceId),
          visibleRowLabels: rows.map((row) => row.rowLabel),
        };
      },
      { expectedLabel, surfaceId },
    );
    throw new Error(JSON.stringify(diagnostics, null, 2), { cause: error });
  }
}
