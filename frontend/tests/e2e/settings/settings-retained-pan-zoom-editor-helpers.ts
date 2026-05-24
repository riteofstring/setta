import { expect, type Page } from "@playwright/test";

import type {
  Rect,
  RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

export async function resolveControlScreenshotClip(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Rect> {
  const rect = row.controlClientRect ?? row.clientRect;
  return await page.evaluate(
    (input) => {
      const width = Math.max(1, Math.floor(input.width));
      const height = Math.max(1, Math.floor(input.height));
      return {
        height,
        width,
        x: Math.min(
          Math.max(0, Math.floor(input.x)),
          window.innerWidth - width,
        ),
        y: Math.min(
          Math.max(0, Math.floor(input.y)),
          window.innerHeight - height,
        ),
      };
    },
    {
      height: Math.min(44, Math.max(1, rect.height)),
      width: Math.min(260, Math.max(1, rect.width)),
      x: rect.x,
      y: rect.y + rect.height / 2 - Math.min(44, rect.height) / 2,
    },
  );
}

export async function readActiveEditorText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const activeElement = document.activeElement;
    const content =
      activeElement instanceof Element
        ? activeElement.closest(".cm-editor")?.querySelector(".cm-content")
        : null;
    return content?.textContent ?? "";
  });
}

export async function activateRetainedEditor(
  page: Page,
  row: RetainedRowDebugEntry,
): ReturnType<typeof readActiveEditorGeometry> {
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing retained control geometry for ${row.rowId}.`);
  }
  const activationRect =
    (await waitForRetainedEditorActivationHostRect(page, row, {
      timeoutMs: 2_000,
    })) ?? row.controlClientRect;
  const attempts = [
    {
      x: activationRect.x + activationRect.width / 2,
      y: activationRect.y + activationRect.height / 2,
    },
    {
      x: activationRect.x + Math.min(48, activationRect.width / 3),
      y: activationRect.y + activationRect.height / 2,
    },
    row.controlClientPoint,
    {
      x:
        row.controlClientRect.x + Math.min(48, row.controlClientRect.width / 3),
      y: row.controlClientRect.y + row.controlClientRect.height / 2,
    },
  ];
  let lastError: unknown = null;
  for (const point of attempts) {
    await page.mouse.click(point.x, point.y);
    try {
      await expect
        .poll(() => readActiveCodeMirrorId(page), { timeout: 3_000 })
        .toContain(row.rowId);
      return await waitForActiveEditorGeometry(page, row.controlClientRect, {
        timeoutMs: 3_000,
      });
    } catch (error) {
      lastError = error;
    }
  }
  const diagnostics = await readRetainedEditorActivationDiagnostics(
    page,
    row,
    attempts,
  );
  const message = `Could not activate retained editor ${row.rowId}. ${JSON.stringify(
    diagnostics,
    null,
    2,
  )}`;
  throw lastError instanceof Error
    ? new Error(message, { cause: lastError })
    : new Error(message);
}

async function waitForRetainedEditorActivationHostRect(
  page: Page,
  row: RetainedRowDebugEntry,
  options: { readonly timeoutMs: number },
): Promise<Rect | null> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const rect = await readRetainedEditorActivationHostRect(page, row);
    if (rect) {
      return rect;
    }
    await page.evaluate(() => {
      window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?.("manual");
    });
    await page.waitForTimeout(50);
  }
  return null;
}

async function readRetainedEditorActivationHostRect(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Rect | null> {
  return await page.evaluate((row) => {
    const selector = [
      '[data-gpu-flow-dom-control="true"]',
      `[data-gpu-flow-dom-control-row-id="${CSS.escape(row.rowId)}"]`,
      `[data-gpu-flow-dom-control-surface-id="${CSS.escape(row.surfaceId)}"]`,
    ].join("");
    const host = document.querySelector<HTMLElement>(selector);
    if (!host || getComputedStyle(host).display === "none") {
      return null;
    }
    const rect = host.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.x + rect.width <= 0 ||
      rect.y + rect.height <= 0 ||
      rect.x >= window.innerWidth ||
      rect.y >= window.innerHeight
    ) {
      return null;
    }
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  }, row);
}

async function readRetainedEditorActivationDiagnostics(
  page: Page,
  row: RetainedRowDebugEntry,
  attempts: readonly { readonly x: number; readonly y: number }[],
) {
  return await page.evaluate(
    ({ attempts, row }) => {
      const selector = [
        '[data-gpu-flow-dom-control="true"]',
        `[data-gpu-flow-dom-control-row-id="${CSS.escape(row.rowId)}"]`,
        `[data-gpu-flow-dom-control-surface-id="${CSS.escape(row.surfaceId)}"]`,
      ].join("");
      const actorId = `retained-dom-control:${row.surfaceId}:${row.rowId}`;
      const host = document.querySelector<HTMLElement>(selector);
      const activeElement = document.activeElement;
      const retainedRows = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).filter(
        (candidate) =>
          candidate.surfaceId === row.surfaceId &&
          candidate.rowId === row.rowId,
      );
      return {
        activeElement:
          activeElement instanceof HTMLElement
            ? {
                className: activeElement.className,
                controlId:
                  activeElement
                    .closest("[data-gpu-flow-control]")
                    ?.getAttribute("data-gpu-flow-control") ?? null,
                tagName: activeElement.tagName,
              }
            : null,
        attempts: attempts.map((point) => {
          const target = document.elementFromPoint(point.x, point.y);
          const element =
            target instanceof HTMLElement
              ? target
              : target?.parentElement ?? null;
          return {
            point,
            target:
              element instanceof HTMLElement
                ? {
                    className: element.className,
                    domControlActive:
                      element
                        .closest("[data-gpu-flow-dom-control]")
                        ?.getAttribute("data-gpu-flow-dom-control-active") ??
                      null,
                    domControlId:
                      element
                        .closest("[data-gpu-flow-dom-control]")
                        ?.getAttribute("data-gpu-flow-dom-control-id") ?? null,
                    domControlRowId:
                      element
                        .closest("[data-gpu-flow-dom-control]")
                        ?.getAttribute("data-gpu-flow-dom-control-row-id") ??
                      null,
                    gpuFlowControl:
                      element
                        .closest("[data-gpu-flow-control]")
                        ?.getAttribute("data-gpu-flow-control") ?? null,
                    tagName: element.tagName,
                  }
                : null,
          };
        }),
        browserVisualPreparation:
          window.__settaGpuFlowBrowserVisualPreparationDiagnostics?.(
            actorId,
          ) ?? null,
        blockedVisiblePublicationEvents:
          window.__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?.slice(
            -5,
          ) ?? [],
        domControlPlaneDiagnostics:
          window.__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null,
        host:
          host instanceof HTMLElement
            ? {
                active: host.getAttribute("data-gpu-flow-dom-control-active"),
                className: host.className,
                display: getComputedStyle(host).display,
                id: host.getAttribute("data-gpu-flow-dom-control-id"),
                pointerEvents: getComputedStyle(host).pointerEvents,
                rect: rectToObject(host.getBoundingClientRect()),
                rowId: host.getAttribute("data-gpu-flow-dom-control-row-id"),
                surfaceId: host.getAttribute(
                  "data-gpu-flow-dom-control-surface-id",
                ),
              }
            : null,
        retainedRows,
        visiblePublication:
          window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().visiblePublication ??
          null,
      };

      function rectToObject(rect: DOMRect): Rect {
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      }
    },
    { attempts, row },
  );
}

export async function waitForActiveEditorGeometry(
  page: Page,
  expectedRect: Rect,
  options: { readonly timeoutMs?: number | undefined } = {},
): ReturnType<typeof readActiveEditorGeometry> {
  const deadline = Date.now() + (options.timeoutMs ?? 5_000);
  let lastError: unknown = null;
  let lastGeometry: Awaited<ReturnType<typeof readActiveEditorGeometry>> | null =
    null;
  while (Date.now() < deadline) {
    try {
      lastGeometry = await readActiveEditorGeometry(page, expectedRect);
      if (isActiveEditorGeometryAligned(lastGeometry)) {
        return lastGeometry;
      }
      lastError = new Error(
        `Active CodeMirror editor geometry is not aligned: ${JSON.stringify(
          lastGeometry,
        )}`,
      );
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(50);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Missing active CodeMirror editor.");
}

export async function waitForViewportIdle(page: Page): Promise<void> {
  const deadlineMs = Date.now() + 5_000;
  let lastState: Awaited<ReturnType<typeof readViewportIdleState>> = null;
  while (Date.now() < deadlineMs) {
    lastState = await readViewportIdleState(page);
    if (lastState?.idle) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `Viewport did not become idle: ${JSON.stringify(lastState, null, 2)}`,
  );
}

async function readActiveCodeMirrorId(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof Element)) {
      return null;
    }
    return (
      activeElement
        .closest("[data-gpu-flow-control]")
        ?.getAttribute("data-gpu-flow-control") ?? null
    );
  });
}

async function readActiveEditorGeometry(
  page: Page,
  expectedRect: Rect,
): Promise<{
  readonly heightDelta: number;
  readonly leftDelta: number;
  readonly topDelta: number;
  readonly widthDelta: number;
}> {
  return await page.evaluate((expectedRect) => {
    const activeElement = document.activeElement;
    const activeEditor =
      activeElement instanceof Element
        ? activeElement.closest(".cm-editor")
        : null;
    if (!activeEditor) {
      throw new Error("Missing active CodeMirror editor.");
    }
    const rect = activeEditor.getBoundingClientRect();
    return {
      heightDelta: rect.height - expectedRect.height,
      leftDelta: rect.left - expectedRect.x,
      topDelta: rect.top - expectedRect.y,
      widthDelta: rect.width - expectedRect.width,
    };
  }, expectedRect);
}

function isActiveEditorGeometryAligned(geometry: {
  readonly heightDelta: number;
  readonly leftDelta: number;
  readonly topDelta: number;
  readonly widthDelta: number;
}): boolean {
  return (
    Math.abs(geometry.leftDelta) < 2 &&
    Math.abs(geometry.topDelta) < 9 &&
    Math.abs(geometry.widthDelta) < 2 &&
    Math.abs(geometry.heightDelta) < 10
  );
}

async function readViewportIdleState(page: Page) {
  return await page.evaluate(async () => {
    const [{ getRegisteredGpuFlowViewportRuntime }, { gpuFlowViewportStore }] =
      await Promise.all([
        import("/src/gpuFlow/viewportRuntimeRegistry.ts"),
        import("/src/gpuFlow/viewportStore.ts"),
      ]);
    const runtime = getRegisteredGpuFlowViewportRuntime(gpuFlowViewportStore);
    const runtimeDebug = runtime as
      | {
          readonly destroyed?: boolean | undefined;
          readonly transition?:
            | {
                readonly durationMs: number;
                readonly from: unknown;
                readonly startTimeMs: number | null;
                readonly to: unknown;
              }
            | null
            | undefined;
          readonly transitionCompletionHandle?: unknown;
          readonly viewportFramePending?: boolean | undefined;
        }
      | undefined;
    const viewport =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport ?? null;
    if (!viewport) {
      return null;
    }
    return {
      idle:
        !viewport.viewportInteractionActive &&
        !viewport.wheelZooming &&
        !viewport.viewportAnimating,
      nodeDragging: viewport.nodeDragging,
      nodeResizing: viewport.nodeResizing,
      panScrolling: viewport.panScrolling,
      paneDragging: viewport.paneDragging,
      pointerPanning: viewport.pointerPanning,
      registeredRuntimeDestroyed: runtimeDebug?.destroyed ?? null,
      registeredRuntimeFramePending: runtimeDebug?.viewportFramePending ?? null,
      registeredRuntimeTransition: runtimeDebug?.transition ?? null,
      registeredRuntimeTransitionCompletionPending:
        runtimeDebug?.transitionCompletionHandle != null,
      registeredRuntimeViewport: runtime?.getViewportTuple() ?? null,
      transform: viewport.transform,
      viewportAnimating: viewport.viewportAnimating,
      viewportInteractionActive: viewport.viewportInteractionActive,
      wheelZooming: viewport.wheelZooming,
    };
  });
}
