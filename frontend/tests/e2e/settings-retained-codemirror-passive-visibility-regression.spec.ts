import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "./helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  compareScreenshots,
  type Point,
  type Rect,
} from "./settings/settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const TARGET_SURFACES = [
  {
    label: "gui",
    preferredLabels: ["Max Zoom"],
    preferredRowIdParts: ["__maxZoom"],
    surfaceId: "settings-section__gui:param-content:unpinned",
    view: "all-settings",
  },
  {
    label: "sectionSizingPolicy",
    preferredLabels: [],
    preferredRowIdParts: [
      "__byType__Browser__minWidth",
      "__byType__Browser__maxWidth",
      "__byType__Callable__minWidth",
    ],
    surfaceId: "settings-section__sectionSizingPolicy:param-content:unpinned",
    view: "all-settings",
  },
] as const;

type RetainedTextLikeRowTarget = {
  readonly controlClientPoint: Point;
  readonly controlClientRect: Rect;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceId: string;
};

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

for (const targetSurface of TARGET_SURFACES) {
  test(`inactive CodeMirror text is visible before click in settings ${targetSurface.label}`, async ({
    page,
  }, testInfo) => {
    await openTargetSettingsView(page, targetSurface);
    await page.addStyleTag({
      content: ".cm-cursor,.cm-cursorLayer{opacity:0!important}",
    });
    const target = await centerVisibleTextLikeRowAtZoom(
      page,
      targetSurface,
      targetSurface.surfaceId,
      1.35,
    );
    await performRecordedStyleViewportGesture(page, target.controlClientPoint);
    await waitForViewportIdle(page);
    const settledTarget = await resolveVisibleTextLikeRow(
      page,
      targetSurface,
      targetSurface.surfaceId,
    );
    const clip = await resolveValueClip(page, settledTarget.controlClientRect);
    const passiveFrame = await screenshotClip({
      name: `${targetSurface.label}-passive-before-click.png`,
      page,
      rect: clip,
      testInfo,
    });
    const passiveInk = await analyzeCodeMirrorTextInkBounds(page, {
      clip,
      screenshot: passiveFrame,
      searchRect: settledTarget.controlClientRect,
    });

    await page.mouse.click(
      settledTarget.controlClientPoint.x,
      settledTarget.controlClientPoint.y,
    );
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
    const activeEditorId = await readActiveCodeMirrorId(page);
    const activeFrame = await screenshotClip({
      name: `${targetSurface.label}-active-after-click.png`,
      page,
      rect: clip,
      testInfo,
    });
    const [activeInk, activationDelta] = await Promise.all([
      analyzeCodeMirrorTextInkBounds(page, {
        clip,
        screenshot: activeFrame,
        searchRect: settledTarget.controlClientRect,
      }),
      compareScreenshots(page, passiveFrame, activeFrame),
    ]);
    const failureDetails = JSON.stringify(
      {
        activeEditorId,
        activationDelta,
        activeInk,
        passiveInk,
        settledTarget,
        targetSurface,
      },
      null,
      2,
    );

    expect(passiveInk, failureDetails).not.toBeNull();
    expect(activeInk, failureDetails).not.toBeNull();
    expect(passiveInk?.pixelCount ?? 0, failureDetails).toBeGreaterThan(0);
    expect(activeInk?.pixelCount ?? 0, failureDetails).toBeGreaterThan(0);
    if (activeEditorId !== null) {
      expect(activeEditorId, failureDetails).toContain(settledTarget.rowId);
    }
    expect(activationDelta.meanDelta, failureDetails).toBeLessThan(8);
    expect(activationDelta.changedPixelRatio, failureDetails).toBeLessThan(
      0.16,
    );
  });
}

async function openTargetSettingsView(
  page: Page,
  targetSurface: (typeof TARGET_SURFACES)[number],
): Promise<void> {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  if (targetSurface.view === "all-settings") {
    const allSettingsTab = page.getByRole("button", {
      exact: true,
      name: "All Settings",
    });
    await expect(allSettingsTab).toBeVisible();
    await allSettingsTab.click();
  }
  await expect
    .poll(() => countRetainedRows(page), { timeout: 10_000 })
    .toBeGreaterThan(targetSurface.view === "all-settings" ? 250 : 10);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
}

async function countRetainedRows(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
  );
}

async function centerVisibleTextLikeRowAtZoom(
  page: Page,
  targetSurface: (typeof TARGET_SURFACES)[number],
  surfaceId: string,
  zoom: number,
): Promise<RetainedTextLikeRowTarget> {
  const target = await resolveTextLikeRow(page, {
    preferredLabels: targetSurface.preferredLabels,
    preferredRowIdParts: targetSurface.preferredRowIdParts,
    requireVisible: false,
    surfaceId,
  });
  await page.evaluate(
    async ({ point, zoom }) => {
      const pane = document.querySelector<HTMLElement>(
        ".setta-gpu-flow__pane",
      );
      const transform =
        window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
      if (!pane || !transform) {
        throw new Error("Missing GPU flow viewport debug state.");
      }
      const paneRect = pane.getBoundingClientRect();
      const flowPoint = {
        x: (point.x - paneRect.left - transform.x) / transform.zoom,
        y: (point.y - paneRect.top - transform.y) / transform.zoom,
      };
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      gpuFlowViewportStore.getState().setTransform({
        x: paneRect.width * 0.72 - flowPoint.x * zoom,
        y: paneRect.height * 0.48 - flowPoint.y * zoom,
        zoom,
      });
    },
    { point: target.controlClientPoint, zoom },
  );
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
  return await resolveTextLikeRow(page, {
    preferredLabels: targetSurface.preferredLabels,
    preferredRowIdParts: targetSurface.preferredRowIdParts,
    requireVisible: true,
    surfaceId,
  });
}

async function resolveVisibleTextLikeRow(
  page: Page,
  targetSurface: (typeof TARGET_SURFACES)[number],
  surfaceId: string,
): Promise<RetainedTextLikeRowTarget> {
  return await resolveTextLikeRow(page, {
    preferredLabels: targetSurface.preferredLabels,
    preferredRowIdParts: targetSurface.preferredRowIdParts,
    requireVisible: true,
    surfaceId,
  });
}

async function resolveTextLikeRow(
  page: Page,
  input: {
    readonly preferredLabels: readonly string[];
    readonly preferredRowIdParts: readonly string[];
    readonly requireVisible: boolean;
    readonly surfaceId: string;
  },
): Promise<RetainedTextLikeRowTarget> {
  return await page.evaluate(
    ({
      preferredLabels,
      preferredRowIdParts,
      requireVisible,
      suffix,
      surfaceId,
    }) => {
      const bounds = resolveUnoccludedFlowBounds();
      const preferredLabelSet = new Set(preferredLabels);
      const hasPreferredTargets =
        preferredLabels.length > 0 || preferredRowIdParts.length > 0;
      const candidates = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      )
        .filter((row) => {
          const preferredRank = getPreferredRank(row.rowId, row.rowLabel);
          return (
            row.surfaceId === surfaceId &&
            row.surfaceId.endsWith(suffix) &&
            row.controlKind === "text-like" &&
            row.controlClientPoint !== null &&
            row.controlClientRect !== null &&
            !row.rowState?.disabled &&
            row.rowLabel.trim().length > 0 &&
            (!hasPreferredTargets || preferredRank >= 0) &&
            (!requireVisible ||
              (intersects(row.controlClientRect, bounds) &&
                intersectsDrawnSurface(row.surfaceId, row.controlClientRect) &&
                row.controlClientRect.width > 80 &&
                row.controlClientRect.height > 12))
          );
        })
        .map((row) => {
          const controlRect = row.controlClientRect;
          const controlPoint = row.controlClientPoint;
          if (!controlRect || !controlPoint) {
            throw new Error(`Missing control geometry for ${row.rowId}.`);
          }
          return {
            controlClientPoint: controlPoint,
            controlClientRect: controlRect,
            distanceToCenter: Math.hypot(
              controlPoint.x - (bounds.x + bounds.width * 0.5),
              controlPoint.y - (bounds.y + bounds.height * 0.5),
            ),
            preferredRank: getPreferredRank(row.rowId, row.rowLabel),
            rowId: row.rowId,
            rowLabel: row.rowLabel,
            surfaceId: row.surfaceId,
          };
        })
        .sort(
          (left, right) =>
            normalizePreferredRank(left.preferredRank) -
              normalizePreferredRank(right.preferredRank) ||
            left.distanceToCenter - right.distanceToCenter,
        );
      const target = candidates[0];
      if (!target) {
        const sampleRows = (
          window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
        )
          .filter((row) => row.surfaceId === surfaceId)
          .slice(0, 40)
          .map((row) => ({ rowId: row.rowId, rowLabel: row.rowLabel }));
        throw new Error(
          `Missing ${requireVisible ? "visible " : ""}text-like row for ${surfaceId}. Samples: ${JSON.stringify(sampleRows)}`,
        );
      }
      return {
        controlClientPoint: target.controlClientPoint,
        controlClientRect: target.controlClientRect,
        rowId: target.rowId,
        rowLabel: target.rowLabel,
        surfaceId: target.surfaceId,
      };

      function resolveUnoccludedFlowBounds() {
        const canvas = document.querySelector<HTMLElement>(
          ".setta-gpu-flow__canvas",
        );
        const rect = canvas?.getBoundingClientRect();
        const base = rect
          ? {
              height: rect.height,
              width: rect.width,
              x: rect.x,
              y: rect.y,
            }
          : {
              height: window.innerHeight,
              width: window.innerWidth,
              x: 0,
              y: 0,
            };
        const left = Array.from(
          document.querySelectorAll<HTMLElement>(".setta-gpu-flow__panel"),
        ).reduce((edge, panel) => {
          const panelRect = panel.getBoundingClientRect();
          if (
            panelRect.width <= 0 ||
            panelRect.height <= 0 ||
            panelRect.right <= base.x ||
            panelRect.left >= base.x + base.width * 0.5 ||
            panelRect.bottom <= base.y ||
            panelRect.top >= base.y + base.height
          ) {
            return edge;
          }
          return Math.max(edge, panelRect.right);
        }, base.x);
        return {
          height: base.height,
          width: Math.max(1, base.x + base.width - left),
          x: left,
          y: base.y,
        };
      }

      function intersects(left: Rect, right: Rect): boolean {
        return (
          left.x < right.x + right.width &&
          left.x + left.width > right.x &&
          left.y < right.y + right.height &&
          left.y + left.height > right.y
        );
      }

      function intersectsDrawnSurface(surfaceId: string, rect: Rect): boolean {
        return (window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? []).some(
          (surface) =>
            (surface.surfaceId === surfaceId ||
              surface.surfaceId.startsWith(`${surfaceId}:`)) &&
            surface.clientRect.width > 0 &&
            surface.clientRect.height > 0 &&
            intersects(surface.clientRect, rect),
        );
      }

      function getPreferredRank(rowId: string, rowLabel: string): number {
        const labelIndex = preferredLabels.findIndex(
          (label) => label === rowLabel,
        );
        const idIndex = preferredRowIdParts.findIndex((part) =>
          rowId.includes(part),
        );
        if (labelIndex < 0) {
          return idIndex;
        }
        if (idIndex < 0) {
          return labelIndex;
        }
        return Math.min(labelIndex, idIndex);
      }

      function normalizePreferredRank(rank: number): number {
        return rank < 0 ? Number.MAX_SAFE_INTEGER : rank;
      }
    },
    {
      preferredLabels: input.preferredLabels,
      preferredRowIdParts: input.preferredRowIdParts,
      requireVisible: input.requireVisible,
      suffix: SETTINGS_PARAM_CONTENT_SUFFIX,
      surfaceId: input.surfaceId,
    },
  );
}

async function performRecordedStyleViewportGesture(
  page: Page,
  point: Point,
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 80; index += 1) {
      await page.mouse.wheel(0, index < 44 ? -4 : 5);
      if (index % 12 === 0) {
        await page.waitForTimeout(6);
      }
    }
  } finally {
    await page.keyboard.up("Control");
  }
  await waitForAnimationFrame(page);
}

async function resolveValueClip(page: Page, rect: Rect): Promise<Rect> {
  return await page.evaluate((input) => {
    const padding = 8;
    const width = Math.min(
      Math.max(1, Math.floor(input.width + padding * 2)),
      Math.max(1, window.innerWidth - 1),
    );
    const height = Math.min(
      Math.max(1, Math.floor(input.height + padding * 2)),
      Math.max(1, window.innerHeight - 1),
    );
    const x = Math.min(
      Math.max(0, Math.floor(input.x - padding)),
      Math.max(0, window.innerWidth - width),
    );
    const y = Math.min(
      Math.max(0, Math.floor(input.y - padding)),
      Math.max(0, window.innerHeight - height),
    );
    return { height, width, x, y };
  }, rect);
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

async function waitForViewportIdle(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const viewport =
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport ?? null;
          return Boolean(
            viewport &&
              !viewport.viewportInteractionActive &&
              !viewport.wheelZooming &&
              !viewport.viewportAnimating,
          );
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
}

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function screenshotClip({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<Buffer> {
  const screenshot = await page.screenshot({
    clip: rect,
    path: testInfo.outputPath(name),
  });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
  return screenshot;
}
