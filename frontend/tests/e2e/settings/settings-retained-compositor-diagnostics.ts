import type { Page } from "@playwright/test";

export async function readRetainedCompositorVisibleFrameDiagnostics(
  page: Page,
): Promise<unknown> {
  return await page.evaluate(() => {
    const coldStartShell = document.querySelector<HTMLElement>(
      '[data-gpu-flow-cold-start-shell="true"]',
    );
    const blockedEvents =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_FRAME_PRESENTATION_EVENTS__ ?? [];
    const domControlPlane = document.querySelector<HTMLElement>(
      '[data-gpu-flow-dom-control-plane="true"]',
    );
    const snapshotDiagnostics =
      (
        window as typeof window & {
          readonly __settaGpuFlowDomControlSnapshotSourceDiagnostics?: () => readonly {
            readonly expectedTextureContentKey: string;
            readonly inPreparation: boolean;
            readonly sourceId: string;
            readonly surfaceId: string;
            readonly texture: unknown;
          }[];
        }
      ).__settaGpuFlowDomControlSnapshotSourceDiagnostics?.() ?? [];
    const lastBlockedEvent = blockedEvents.at(-1) as
      | {
          readonly blockedReasons?: readonly {
            readonly actorId?: string | null;
          }[];
        }
      | null
      | undefined;
    const lastBlockedActorId =
      lastBlockedEvent?.blockedReasons?.find((reason) => reason.actorId)
        ?.actorId ?? null;
    const lastBlockedSnapshotSourceElement = lastBlockedActorId
      ? [
          ...document.querySelectorAll<HTMLElement>(
            '[data-gpu-flow-dom-control-snapshot-source="true"]',
          ),
        ].find(
          (element) =>
            element.dataset.gpuFlowDomControlId === lastBlockedActorId,
        ) ?? null
      : null;
    const browserVisualPreparationDiagnostics =
      (
        window as typeof window & {
          readonly __settaGpuFlowBrowserVisualPreparationDiagnostics?: (
            actorId?: string | null,
          ) => unknown;
        }
      ).__settaGpuFlowBrowserVisualPreparationDiagnostics?.(
        lastBlockedActorId,
      ) ?? null;
    const debugSnapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
    const retainedSceneSummary =
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_SCENE_SUMMARY__?.() ?? null;
    const retainedNativeVisuals =
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_NATIVE_VISUALS__?.() ?? null;
    const browserVisualResourceWork =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__ ?? [];
    const dirtySurfaceTextureUploads =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_DIRTY_SURFACE_TEXTURE_UPLOADS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_DIRTY_SURFACE_TEXTURE_UPLOADS__ ?? [];
    const presentationDebtFrameRequests =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_PRESENTATION_DEBT_FRAME_REQUESTS__ ?? [];
    const paintUnavailableUploads =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_HTML_SURFACE_PAINT_UNAVAILABLE_UPLOADS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_HTML_SURFACE_PAINT_UNAVAILABLE_UPLOADS__ ?? [];
    const recentGpuFlowFrameMeasures = performance
      .getEntriesByType("measure")
      .filter((entry) => entry.name.startsWith("setta.gpuFlow.surface-frame"))
      .slice(-8)
      .map((entry) => ({
        detail:
          entry instanceof PerformanceMeasure &&
          entry.detail &&
          typeof entry.detail === "object"
            ? entry.detail
            : null,
        duration: entry.duration,
        name: entry.name,
      }));
    if (!coldStartShell) {
      return {
        blockedEventCount: blockedEvents.length,
        browserVisualResourceWork,
        coldStartShell: null,
        dirtySurfaceTextureUploads,
        domControlCount: document.querySelectorAll(
          '[data-gpu-flow-dom-control="true"]',
        ).length,
        domControlPlanePreparedContentFrameId:
          domControlPlane?.dataset
            .gpuFlowDomControlPlanePreparedContentFrameId ?? null,
        presentationDebtFrameRequests,
        recentGpuFlowFrameMeasures,
        retainedNativeVisuals,
        retainedRowCount:
          window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
        retainedSceneSummary,
        visibleProjection: debugSnapshot?.visibleProjection ?? null,
      };
    }
    return {
      blockedEventCount: blockedEvents.length,
      browserVisualResourceWork,
      coldStartShell: {
        frameId: coldStartShell.dataset.gpuFlowColdStartShellFrameId ?? null,
        reason: coldStartShell.dataset.gpuFlowColdStartShellReason ?? null,
      },
      dirtySurfaceTextureUploads,
      domControlCount: document.querySelectorAll(
        '[data-gpu-flow-dom-control="true"]',
      ).length,
      domControlPlanePreparedContentFrameId:
        domControlPlane?.dataset.gpuFlowDomControlPlanePreparedContentFrameId ??
        null,
      domControlPlaneRuntimeFrameId:
        domControlPlane?.dataset.gpuFlowDomControlPlaneFrameId ?? null,
      lastBlockedEvent: lastBlockedEvent ?? null,
      paintUnavailableUploads,
      presentationDebtFrameRequests,
      lastBlockedSnapshotDiagnostic: lastBlockedActorId
        ? snapshotDiagnostics.find(
            (diagnostic) => diagnostic.sourceId === lastBlockedActorId,
          ) ?? null
        : null,
      lastBlockedSnapshotSourceElement: lastBlockedSnapshotSourceElement
        ? {
            captureOnly:
              lastBlockedSnapshotSourceElement.getAttribute(
                "data-gpu-flow-capture-only-source",
              ) ?? null,
            connected: lastBlockedSnapshotSourceElement.isConnected,
            computedStyle: (() => {
              const style = window.getComputedStyle(
                lastBlockedSnapshotSourceElement,
              );
              return {
                contain: style.contain,
                display: style.display,
                opacity: style.opacity,
                overflow: style.overflow,
                pointerEvents: style.pointerEvents,
                position: style.position,
                transform: style.transform,
                visibility: style.visibility,
                zIndex: style.zIndex,
              };
            })(),
            explicitDirty:
              lastBlockedSnapshotSourceElement.getAttribute(
                "data-gpu-flow-explicit-dirty-source",
              ) ?? null,
            parentTagName:
              lastBlockedSnapshotSourceElement.parentElement?.tagName ?? null,
            rect: (() => {
              const rect =
                lastBlockedSnapshotSourceElement.getBoundingClientRect();
              return {
                bottom: rect.bottom,
                height: rect.height,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                width: rect.width,
                x: rect.x,
                y: rect.y,
              };
            })(),
            sourceId:
              lastBlockedSnapshotSourceElement.dataset.gpuFlowSourceId ?? null,
          }
        : null,
      lastBlockedBrowserVisualPreparation: browserVisualPreparationDiagnostics,
      preparationControlCount: document.querySelectorAll(
        '[data-gpu-flow-dom-control-preparation="true"]',
      ).length,
      recentGpuFlowFrameMeasures,
      retainedNativeVisuals,
      retainedRowCount:
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
      retainedSceneSummary,
      snapshotContentCount: document.querySelectorAll(
        '[data-gpu-flow-retained-dom-control-snapshot-content="true"]',
      ).length,
      snapshotDiagnosticCount: snapshotDiagnostics.length,
      snapshotSourceCount: document.querySelectorAll(
        '[data-gpu-flow-dom-control-snapshot-source="true"]',
      ).length,
      visibleProjection: debugSnapshot?.visibleProjection ?? null,
    };
  });
}
