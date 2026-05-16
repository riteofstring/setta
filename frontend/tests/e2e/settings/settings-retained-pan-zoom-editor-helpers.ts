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
  const attempts = [
    row.controlClientPoint,
    {
      x: row.controlClientRect.x + row.controlClientRect.width / 2,
      y: row.controlClientRect.y + row.controlClientRect.height / 2,
    },
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
        .poll(() => readActiveCodeMirrorId(page), { timeout: 1_500 })
        .toContain(row.rowId);
      return await waitForActiveEditorGeometry(page, row.controlClientRect, {
        timeoutMs: 1_500,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not activate retained editor ${row.rowId}.`);
}

export async function waitForActiveEditorGeometry(
  page: Page,
  expectedRect: Rect,
  options: { readonly timeoutMs?: number | undefined } = {},
): ReturnType<typeof readActiveEditorGeometry> {
  const deadline = Date.now() + (options.timeoutMs ?? 5_000);
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      return await readActiveEditorGeometry(page, expectedRect);
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(50);
    }
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
