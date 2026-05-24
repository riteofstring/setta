import type { Page } from "@playwright/test";

import type {
  Rect,
  RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

type TextLikeNativeSemanticsTarget = {
  readonly rowId: string;
  readonly surfaceId: string;
};

export async function readRetainedSurfaceRowSearchDiagnostics(
  page: Page,
  target: TextLikeNativeSemanticsTarget,
): Promise<unknown> {
  return await page.evaluate((target) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === target.surfaceId,
      )
      .map((row) => ({
        canvasSamplePoint: row.canvasSamplePoint,
        clientRect: row.clientRect,
        controlClientRect: row.controlClientRect,
        controlKind: row.controlKind,
        rowId: row.rowId,
        surfaceContentHeight: row.surfaceContentHeight,
        surfaceLogicalRowCount: row.surfaceLogicalRowCount,
        surfaceScrollOffset: row.surfaceScrollOffset,
        surfaceViewportHeight: row.surfaceViewportHeight,
      }));
    const visibleRows = rows
      .filter(
        (row) =>
          row.clientRect.width > 8 &&
          row.clientRect.height > 8 &&
          row.clientRect.x + row.clientRect.width > 0 &&
          row.clientRect.y + row.clientRect.height > 0 &&
          row.clientRect.x < window.innerWidth &&
          row.clientRect.y < window.innerHeight,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    const wheelRow =
      visibleRows[Math.floor(visibleRows.length / 2)] ?? visibleRows[0];
    const wheelPoint = wheelRow
      ? {
          x: Math.min(
            window.innerWidth - 4,
            Math.max(
              4,
              wheelRow.clientRect.x + wheelRow.clientRect.width * 0.32,
            ),
          ),
          y: Math.min(
            window.innerHeight - 4,
            Math.max(4, wheelRow.clientRect.y + wheelRow.clientRect.height / 2),
          ),
        }
      : null;
    const wheelTarget = wheelPoint
      ? document.elementFromPoint(wheelPoint.x, wheelPoint.y)
      : null;
    const wheelTargetAncestors: unknown[] = [];
    let ancestor =
      wheelTarget instanceof Element ? wheelTarget : wheelTarget?.parentElement;
    while (ancestor && wheelTargetAncestors.length < 8) {
      wheelTargetAncestors.push(describeElement(ancestor));
      ancestor = ancestor.parentElement;
    }
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
    const visualSurfaces =
      window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? [];
    const blockedEvents =
      (
        window as typeof window & {
          __SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__ ?? [];
    const publicationDebtRequests =
      (
        window as typeof window & {
          __SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__?: readonly {
            readonly blockedReasons?: readonly {
              readonly actorId?: string | null;
              readonly reason?: string | null;
            }[];
            readonly budgetDecision?: {
              readonly browserVisualRepair?: unknown;
              readonly preparationBudget?: {
                readonly deferredDebtIds?: readonly string[];
                readonly overBudgetDebtIds?: readonly string[];
                readonly selectedDebtIds?: readonly string[];
                readonly selectedResourceDebtIds?: readonly string[];
                readonly selectedVisibleDebtIds?: readonly string[];
                readonly usedMs?: number;
              };
            };
            readonly completionDebt?: unknown;
            readonly completionOutcome?: unknown;
            readonly frame?: number;
            readonly frameReason?: string | null;
            readonly outcomeKind?: string;
            readonly reducerLane?: string;
            readonly resourceGraph?: {
              readonly debtAgeByResourceKey?: Record<string, unknown>;
              readonly pendingCandidateFrameIds?: readonly number[];
              readonly queuedResourceKeys?: readonly string[];
              readonly resourceDebtByState?: unknown;
            };
            readonly reducerState?: string;
          }[];
        }
      ).__SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__ ?? [];
    const browserVisualResourceWork =
      (
        window as typeof window & {
          __SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__?: readonly {
            readonly actorId?: string | null;
            readonly blockedReason?: string;
            readonly candidateResourceKey?: string;
            readonly debtAgeFrames?: number;
            readonly debtAgeMs?: number;
            readonly ownerFrameId?: number;
            readonly readinessState?: string;
            readonly sourceHostIdentity?: string;
            readonly wakeupSource?: string;
          }[];
        }
      ).__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__ ?? [];
    const snapshotSourceDiagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlSnapshotSourceDiagnostics?: () => readonly {
            readonly dirtySurface?: boolean;
            readonly inPreparation?: boolean;
            readonly sourceId?: string;
            readonly surfaceId?: string;
            readonly texture?: { readonly textureContentKey?: string | null };
          }[];
        }
      ).__settaGpuFlowDomControlSnapshotSourceDiagnostics?.() ?? [];
    const retainedScrollState = summarizeRetainedScrollState(
      (
        window as typeof window & {
          __SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_STATE__?: () => unknown;
        }
      ).__SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_STATE__?.() ?? null,
      target.surfaceId,
    );
    return {
      blockedEvents: blockedEvents.slice(-5),
      browserVisualResourceWork: browserVisualResourceWork.slice(-12),
      coldStartShell: document.querySelector<HTMLElement>(
        '[data-gpu-flow-cold-start-shell="true"]',
      )
        ? true
        : false,
      matchingRow: rows.find((row) => row.rowId === target.rowId) ?? null,
      rowCount: rows.length,
      rows: rows.slice(0, 20),
      publicationDebtRequests: publicationDebtRequests
        .slice(-8)
        .map((entry) => ({
          blockedReasons: entry.blockedReasons,
          budgetDecision: entry.budgetDecision
            ? {
                browserVisualRepair: entry.budgetDecision.browserVisualRepair,
                preparationBudget: entry.budgetDecision.preparationBudget
                  ? {
                      deferredDebtIds:
                        entry.budgetDecision.preparationBudget.deferredDebtIds,
                      overBudgetDebtIds:
                        entry.budgetDecision.preparationBudget
                          .overBudgetDebtIds,
                      selectedDebtIds:
                        entry.budgetDecision.preparationBudget.selectedDebtIds,
                      selectedResourceDebtIds:
                        entry.budgetDecision.preparationBudget
                          .selectedResourceDebtIds,
                      selectedVisibleDebtIds:
                        entry.budgetDecision.preparationBudget
                          .selectedVisibleDebtIds,
                      usedMs: entry.budgetDecision.preparationBudget.usedMs,
                    }
                  : null,
              }
            : null,
          completionDebt: entry.completionDebt,
          completionOutcome: entry.completionOutcome,
          frame: entry.frame,
          frameReason: entry.frameReason,
          outcomeKind: entry.outcomeKind,
          reducerLane: entry.reducerLane,
          resourceGraph: entry.resourceGraph
            ? {
                debtAgeByResourceKey: Object.fromEntries(
                  Object.entries(
                    entry.resourceGraph.debtAgeByResourceKey ?? {},
                  ).slice(-12),
                ),
                pendingCandidateFrameIds:
                  entry.resourceGraph.pendingCandidateFrameIds,
                queuedResourceKeys:
                  entry.resourceGraph.queuedResourceKeys?.slice(-12),
                resourceDebtByState: entry.resourceGraph.resourceDebtByState,
              }
            : null,
          reducerState: entry.reducerState,
        })),
      snapshotSourceDiagnostics: snapshotSourceDiagnostics
        .filter((entry) => entry.surfaceId === target.surfaceId)
        .slice(-12)
        .map((entry) => ({
          dirtySurface: entry.dirtySurface,
          inPreparation: entry.inPreparation,
          sourceId: entry.sourceId,
          textureReady: entry.texture?.textureContentKey ? true : false,
        })),
      target,
      visibleProjection: snapshot?.visibleProjection ?? null,
      visibleSurface:
        visualSurfaces.find((surface) => surface.id === target.surfaceId) ??
        null,
      viewport: snapshot?.viewport ?? null,
      wheelEvents: (
        (
          window as typeof window & {
            __SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_EVENTS__?: readonly unknown[];
            __SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_EVENTS__?: readonly unknown[];
          }
        ).__SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_EVENTS__ ?? []
      ).slice(-12),
      retainedScrollEvents: (
        (
          window as typeof window & {
            __SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_EVENTS__?: readonly unknown[];
          }
        ).__SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_EVENTS__ ?? []
      ).slice(-12),
      retainedScrollState,
      wheelPoint,
      wheelTarget: describeElement(wheelTarget),
      wheelTargetAncestors,
      window: { height: window.innerHeight, width: window.innerWidth },
    };

    function describeElement(element: Element | null): unknown {
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      return {
        className: element.className,
        domControl: element.dataset.gpuFlowDomControl ?? null,
        domControlPlane: element.dataset.gpuFlowDomControlPlane ?? null,
        gpuFlowSurface: element.dataset.gpuFlowSurface ?? null,
        id: element.id,
        pointerEvents: getComputedStyle(element).pointerEvents,
        rect: toPlainRect(element.getBoundingClientRect()),
        tagName: element.tagName,
      };
    }

    function toPlainRect(rect: DOMRect): Rect {
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    }

    function summarizeRetainedScrollState(state: unknown, surfaceId: string) {
      if (!state || typeof state !== "object") {
        return state;
      }
      const value = state as {
        runtimeOffsets?: unknown;
        runtimeRevision?: unknown;
        selectedOffsets?: unknown;
        selectedRevision?: unknown;
        visibleOffsets?: unknown;
        visibleProjectionSampleId?: unknown;
        visibleRevision?: unknown;
        visibleTransactionKind?: unknown;
      };
      const offsetFor = (offsets: unknown) => {
        if (!Array.isArray(offsets)) {
          return null;
        }
        const entry = offsets.find(
          (candidate): candidate is readonly [string, unknown] =>
            Array.isArray(candidate) && candidate[0] === surfaceId,
        );
        return entry?.[1] ?? null;
      };
      return {
        runtimeOffset: offsetFor(value.runtimeOffsets),
        runtimeRevision: value.runtimeRevision,
        selectedOffset: offsetFor(value.selectedOffsets),
        selectedRevision: value.selectedRevision,
        visibleOffset: offsetFor(value.visibleOffsets),
        visibleProjectionSampleId: value.visibleProjectionSampleId,
        visibleRevision: value.visibleRevision,
        visibleTransactionKind: value.visibleTransactionKind,
      };
    }
  }, target);
}

export async function installRetainedSurfaceWheelProbe(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    const view = window as typeof window & {
      __SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_EVENTS__?: unknown[];
      __SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_EVENTS__?: unknown[];
      __SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_PROBE__?: true;
    };
    if (view.__SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_PROBE__) {
      return;
    }
    view.__SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_PROBE__ = true;
    view.__SETTA_GPU_FLOW_DEBUG_RETAINED_SCROLL_EVENTS__ = [];
    view.__SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_EVENTS__ = [];
    window.addEventListener(
      "wheel",
      (event) => {
        const target =
          event.target instanceof HTMLElement ? event.target : null;
        const record = {
          clientX: event.clientX,
          clientY: event.clientY,
          defaultPreventedAtCapture: event.defaultPrevented,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          target: describeElement(target),
          timestamp: performance.now(),
        };
        const events = view.__SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_EVENTS__ ?? [];
        events.push(record);
        view.__SETTA_GPU_FLOW_TEST_RETAINED_WHEEL_EVENTS__ = events.slice(-12);
        window.setTimeout(() => {
          (
            record as { defaultPreventedAfterDispatch?: boolean }
          ).defaultPreventedAfterDispatch = event.defaultPrevented;
        }, 0);
      },
      { capture: true, passive: true },
    );

    function describeElement(element: HTMLElement | null): unknown {
      if (!element) {
        return null;
      }
      return {
        className: element.className,
        domControl: element.dataset.gpuFlowDomControl ?? null,
        gpuFlowSurface: element.dataset.gpuFlowSurface ?? null,
        id: element.id,
        tagName: element.tagName,
      };
    }
  });
}
