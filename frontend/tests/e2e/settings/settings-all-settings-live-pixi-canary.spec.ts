import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS,
  LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT,
  LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM,
} from "../../../src/components/Params/liveDictAreaPixiSceneView";
import {
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
} from "../../../src/components/Params/liveDictAreaPixiValueRowPerf";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
} from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL);
const READY_SELECTOR = ".react-flow__pane";
const LIVE_DICT_AREA_RENDERER_STORAGE_KEY = "setta.liveDictAreaRendererMode";
const LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM =
  "liveDictAreaInteractionMode";
const LIVE_PIXI_MODE = "pixi-node-body";

type DragOverlayRow = {
  height: number;
  id: string;
  top: number;
};

type ValueRowPerfSnapshot = {
  overlayDuration: number;
  presentationTailDuration: number;
  presentedDuration: number;
  presentedEditorKind: string | null;
  presentedRowId: string | null;
  readyDuration: number;
  readyEditorKind: string | null;
  readyRowId: string | null;
  startEditorKind: string | null;
  startRowId: string | null;
};

type ViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

type VisibleBlockBounds = {
  blockId: string;
  height: number;
  sectionId: string;
  width: number;
  x: number;
  y: number;
};

function getBlockKey(block: Pick<VisibleBlockBounds, "blockId" | "sectionId">) {
  return `${block.sectionId}:${block.blockId}`;
}

async function setLiveDictAreaRendererMode(
  page: Page,
  mode: string | null,
): Promise<void> {
  await page.evaluate(
    ({ mode: nextMode, storageKey }) => {
      if (nextMode === null) {
        window.sessionStorage.removeItem(storageKey);
        return;
      }
      window.sessionStorage.setItem(storageKey, nextMode);
    },
    {
      mode,
      storageKey: LIVE_DICT_AREA_RENDERER_STORAGE_KEY,
    },
  );
}

async function openAllSettingsPage(
  page: Page,
  options?: {
    interactionMode?: "param-select";
    overviewEnabled?: boolean;
    rendererMode?: string | null;
  },
) {
  await ensureAppReady(page);
  await setLiveDictAreaRendererMode(page, options?.rendererMode ?? null);

  const url = new URL(SETTINGS_URL);
  if (options?.interactionMode) {
    url.searchParams.set(
      LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM,
      options.interactionMode,
    );
  }
  if (options?.overviewEnabled) {
    url.searchParams.set(LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM, "enabled");
  }
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
}

async function openAllSettingsLivePixiCanary(
  page: Page,
  options?: {
    interactionMode?: "param-select";
    overviewEnabled?: boolean;
  },
) {
  await openAllSettingsPage(page, {
    interactionMode: options?.interactionMode,
    overviewEnabled: options?.overviewEnabled,
    rendererMode: LIVE_PIXI_MODE,
  });
}

async function openAllSettingsBaseline(page: Page): Promise<void> {
  await openAllSettingsPage(page, { rendererMode: null });
}

async function readViewportTransform(page: Page): Promise<ViewportTransform> {
  return page.evaluate(async () => {
    const { useReactFlow } = await import("/src/forks/xyflow/core/store");
    const [x, y, zoom] = useReactFlow.getState().transform;
    return { x, y, zoom };
  });
}

async function expectZoomOutButtonDisabled(
  page: Page,
  expectedDisabled: boolean,
): Promise<void> {
  const zoomOutButton = page.getByRole("button", { name: "zoom out" });

  await expect
    .poll(async () => {
      return zoomOutButton.isDisabled();
    })
    .toBe(expectedDisabled);
}

async function zoomViewportOutToMin(page: Page): Promise<void> {
  await page.waitForSelector(READY_SELECTOR);
  await page.waitForSelector("[data-live-dict-area-scene='pixi']");

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const clickResult = await page.evaluate(() => {
      const zoomOutButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      ).find((button) => button.getAttribute("aria-label") === "zoom out");

      if (!zoomOutButton) {
        return "missing";
      }
      if (zoomOutButton.disabled) {
        return "done";
      }

      zoomOutButton.click();
      return "clicked";
    });

    if (clickResult === "missing") {
      throw new Error("Missing zoom out button.");
    }
    if (clickResult === "done") {
      return;
    }

    await page.waitForTimeout(50);
  }

  throw new Error("Unable to reach the minimum viewport zoom.");
}

async function readScenePresentationModes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-scene='pixi']",
      ),
    )
      .filter((sceneRoot) => {
        const rect = sceneRoot.getBoundingClientRect();
        const rowCount = Number.parseInt(
          sceneRoot.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
          10,
        );

        return (
          rowCount > 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        );
      })
      .map(
        (sceneRoot) =>
          sceneRoot.getAttribute(
            "data-live-dict-area-scene-presentation-mode",
          ) ?? "detail",
      )
      .slice(0, 6);
  });
}

async function readVisibleBlockBounds(
  page: Page,
  source: "baseline" | "pixi",
  blockId: string,
): Promise<VisibleBlockBounds[]> {
  return page.evaluate(
    ({ blockId: targetBlockId, source: targetSource }) => {
      const selector =
        targetSource === "baseline"
          ? `[data-dict-area-block-id='${targetBlockId}']`
          : `[data-live-dict-area-scene-block-anchor='true'][data-live-dict-area-scene-block-id='${targetBlockId}']`;

      return Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const sectionId =
            targetSource === "baseline"
              ? element
                  .closest<HTMLElement>("[data-section-id]")
                  ?.getAttribute("data-section-id") ?? ""
              : element.getAttribute("data-live-dict-area-scene-section-id") ??
                "";

          return {
            blockId: targetBlockId,
            height: rect.height,
            sectionId,
            width: rect.width,
            x: rect.x,
            y: rect.y,
          };
        })
        .filter((block) => {
          return (
            block.sectionId.length > 0 &&
            block.width > 0 &&
            block.height > 0 &&
            block.x < window.innerWidth &&
            block.y < window.innerHeight &&
            block.x + block.width > 0 &&
            block.y + block.height > 0
          );
        })
        .sort((a, b) => {
          if (a.y !== b.y) {
            return a.y - b.y;
          }
          return a.x - b.x;
        });
    },
    {
      blockId,
      source,
    },
  );
}

async function withParamSelectHeld(page: Page, callback: () => Promise<void>) {
  const modifierKey = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifierKey);
  await page.keyboard.down("Shift");

  try {
    await callback();
  } finally {
    await page.keyboard.up("Shift");
    await page.keyboard.up(modifierKey);
  }
}

async function dragLocatorBefore(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Missing drag source or target bounds.");
  }

  await page.mouse.move(
    sourceBox.x + Math.max(12, sourceBox.width * 0.18),
    sourceBox.y + Math.max(10, sourceBox.height * 0.2),
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + Math.max(12, targetBox.width * 0.18),
    targetBox.y + Math.max(6, targetBox.height * 0.15),
    { steps: 40 },
  );
  await page.mouse.up();
}

async function readActiveOverlayTopLevelRows(
  page: Page,
  blockId: string,
): Promise<DragOverlayRow[]> {
  return page.evaluate((activeBlockId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activeBlockId}']`,
    );
    if (!overlay) {
      return [];
    }

    const rows = Array.from(
      overlay.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-drag-overlay-row='true'][data-live-dict-area-scene-row-depth='0']",
      ),
    )
      .map((row) => {
        const rect = row.getBoundingClientRect();
        return {
          height: rect.height,
          id: row.getAttribute("data-live-dict-area-drag-overlay-row-id") ?? "",
          top: rect.top,
        };
      })
      .sort((a, b) => a.top - b.top);

    return rows;
  }, blockId);
}

test("all settings canary can replace the live dict-area body with a Pixi scene host", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const metrics = await page.waitForFunction(() => {
    const visibleSceneRoots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-render-mode='pixi-node-body']",
      ),
    ).filter((sceneRoot) => {
      const rect = sceneRoot.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
    });
    const visibleSceneRoot = visibleSceneRoots.find((sceneRoot) => {
      const sceneHost = sceneRoot.querySelector<HTMLElement>(
        "[data-live-dict-area-scene='pixi']",
      );
      const sceneCanvas = sceneHost?.querySelector("canvas");
      if (!sceneHost || !sceneCanvas) {
        return false;
      }

      const rowCount = Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
        10,
      );

      return rowCount > 0;
    });
    if (!visibleSceneRoot) {
      return null;
    }

    const sceneHost = visibleSceneRoot.querySelector<HTMLElement>(
      "[data-live-dict-area-scene='pixi']",
    );
    const sceneCanvas = sceneHost?.querySelector("canvas");
    if (!sceneHost || !sceneCanvas) {
      return null;
    }

    return {
      availableHeight: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-available-height") ??
          "0",
        10,
      ),
      canvasCssHeight: sceneCanvas.getBoundingClientRect().height,
      compactRowHorizontalPadding: Number.parseFloat(
        sceneHost.getAttribute(
          "data-live-dict-area-scene-compact-row-horizontal-padding",
        ) ?? "0",
      ),
      compactRowRadius: Number.parseFloat(
        sceneHost.getAttribute(
          "data-live-dict-area-scene-compact-row-radius",
        ) ?? "0",
      ),
      compactRowSurface: sceneHost.getAttribute(
        "data-live-dict-area-scene-compact-row-surface",
      ),
      presentationMode:
        sceneHost.getAttribute("data-live-dict-area-scene-presentation-mode") ??
        "detail",
      localParamContainerCount: visibleSceneRoot.querySelectorAll(
        '[id^="ParamContainer-"]',
      ).length,
      sceneRootCssHeight: visibleSceneRoot.getBoundingClientRect().height,
      valuePreviewCount: Number.parseInt(
        sceneHost.getAttribute(
          "data-live-dict-area-scene-value-preview-count",
        ) ?? "0",
        10,
      ),
      rowCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
        10,
      ),
      sceneBlockCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-block-count") ?? "0",
        10,
      ),
      visibleSceneRootCount: visibleSceneRoots.length,
    };
  });

  const result = await metrics.jsonValue();
  const visibleHandoffAriaLabels = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "[data-live-dict-area-editor-handoff='value-row']",
      ),
    )
      .filter((button) => {
        const rect = button.getBoundingClientRect();

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        );
      })
      .slice(0, 4)
      .map((button) => button.getAttribute("aria-label") ?? ""),
  );

  expect(result).not.toBeNull();
  expect(result?.visibleSceneRootCount).toBeGreaterThan(0);
  expect(result?.sceneBlockCount).toBeGreaterThan(0);
  expect(result?.rowCount).toBeGreaterThan(0);
  expect(result?.valuePreviewCount).toBeGreaterThan(0);
  expect(result?.availableHeight).toBeGreaterThan(0);
  if (result?.presentationMode === "overview") {
    expect(result?.canvasCssHeight).toBeGreaterThan(0);
  } else {
    expect(result?.canvasCssHeight).toBeGreaterThanOrEqual(
      LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT,
    );
  }
  expect(result?.canvasCssHeight).toBeLessThanOrEqual(
    (result?.sceneRootCssHeight ?? 0) + 1,
  );
  expect(result?.compactRowSurface).toBe("transparent");
  expect(result?.compactRowRadius).toBe(2);
  expect(result?.compactRowHorizontalPadding).toBe(2);
  expect(result?.localParamContainerCount).toBe(0);
  expect(visibleHandoffAriaLabels.length).toBeGreaterThan(0);
  expect(
    visibleHandoffAriaLabels.every(
      (ariaLabel) =>
        ariaLabel.length > 0 &&
        !ariaLabel.startsWith("Activate editor overlay for "),
    ),
  ).toBe(true);
});

test("all settings canary rerenders the Pixi scene canvas when the viewport zoom changes", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const resetZoomButton = page.getByRole("button", { name: "reset zoom" });
  await expect(resetZoomButton).toBeVisible();
  await resetZoomButton.click();

  const sceneCanvas = page
    .locator("[data-live-dict-area-scene='pixi'] canvas")
    .first();
  await expect(sceneCanvas).toBeVisible();
  const readCanvasMetrics = () =>
    sceneCanvas.evaluate((canvas) => ({
      cssHeight: canvas.clientHeight,
      cssWidth: canvas.clientWidth,
      pixelHeight: canvas.height,
      pixelWidth: canvas.width,
    }));
  await page.waitForTimeout(1500);

  const resetCanvasMetrics = await readCanvasMetrics();

  const initialCanvasWidth = resetCanvasMetrics.pixelWidth;
  expect(resetCanvasMetrics.cssHeight).toBeGreaterThan(0);
  expect(resetCanvasMetrics.cssWidth).toBeGreaterThan(0);
  expect(resetCanvasMetrics.pixelHeight).toBeGreaterThan(0);
  expect(resetCanvasMetrics.pixelWidth).toBeGreaterThan(0);

  const zoomInButton = page.getByRole("button", { name: "zoom in" });
  await expect(zoomInButton).toBeVisible();
  await zoomInButton.click();

  await expect
    .poll(() => sceneCanvas.evaluate((canvas) => canvas.width), {
      message: "expected the Pixi scene canvas to redraw at a new zoom",
    })
    .toBeGreaterThan(initialCanvasWidth);

  const zoomedCanvasMetrics = await sceneCanvas.evaluate((canvas) => ({
    cssHeight: canvas.clientHeight,
    cssWidth: canvas.clientWidth,
    pixelHeight: canvas.height,
    pixelWidth: canvas.width,
  }));

  expect(zoomedCanvasMetrics.cssHeight).toBeGreaterThan(0);
  expect(zoomedCanvasMetrics.cssWidth).toBeGreaterThan(0);
  expect(zoomedCanvasMetrics.pixelHeight).toBeGreaterThan(0);
  expect(zoomedCanvasMetrics.pixelWidth).toBeGreaterThan(initialCanvasWidth);
  expect(
    zoomedCanvasMetrics.pixelWidth * zoomedCanvasMetrics.pixelHeight,
  ).toBeLessThanOrEqual(LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS);
});

test("all settings canary keeps low-zoom live Pixi cards in detail mode by default", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await zoomViewportOutToMin(page);

  await expect
    .poll(async () => {
      const modes = await readScenePresentationModes(page);
      return modes.length > 0 && modes.every((mode) => mode === "detail");
    })
    .toBe(true);
});

test("all settings canary restores low-zoom overview mode only for the explicit opt-in query param", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page, {
    overviewEnabled: true,
  });
  await zoomViewportOutToMin(page);

  await expect
    .poll(async () => {
      const modes = await readScenePresentationModes(page);
      return modes.length > 0 && modes.every((mode) => mode === "overview");
    })
    .toBe(true);
});

test("all settings canary exposes stable section anchors on visible Pixi scene roots", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const visibleSceneAnchors = await page.waitForFunction(() => {
    const sceneRoots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id]",
      ),
    ).filter((sceneRoot) => {
      const rect = sceneRoot.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
    });

    const visibleAnchors = sceneRoots
      .map((sceneRoot) => {
        const sectionId =
          sceneRoot.getAttribute("data-live-dict-area-scene-section-id") ?? "";
        const blockCount = Number.parseInt(
          sceneRoot.getAttribute("data-live-dict-area-scene-block-count") ??
            "0",
          10,
        );

        return {
          blockAnchorCount: sceneRoot.querySelectorAll(
            `[data-live-dict-area-scene-block-anchor='true'][data-live-dict-area-scene-section-id='${sectionId}']`,
          ).length,
          blockCount,
          nestedUnderMatchingSection:
            sectionId.length > 0 &&
            sceneRoot.closest(`[data-section-id='${sectionId}']`) !== null,
          sectionId,
        };
      })
      .slice(0, 6);

    return visibleAnchors.length === 0 ? null : visibleAnchors;
  });

  const result = await visibleSceneAnchors.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.length).toBeGreaterThan(0);
  expect(
    result?.every(
      (anchor) =>
        anchor.sectionId.length > 0 &&
        anchor.nestedUnderMatchingSection &&
        anchor.blockCount > 0 &&
        anchor.blockAnchorCount === anchor.blockCount,
    ),
  ).toBe(true);
});

test("all settings canary keeps first visible unpinned live card bodies aligned with baseline when both renderers share the same viewport transform", async ({
  page,
}) => {
  await openAllSettingsBaseline(page);

  const baselineViewport = await readViewportTransform(page);
  expect(baselineViewport.zoom).toBeGreaterThan(0);
  const projectConfigId = await getCurrentProjectConfigId(page);

  try {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: baselineViewport,
    });

    await openAllSettingsBaseline(page);
    await expect
      .poll(async () => readViewportTransform(page))
      .toEqual(baselineViewport);

    await expect
      .poll(async () => {
        return (await readVisibleBlockBounds(page, "baseline", "unpinned"))
          .length;
      })
      .toBeGreaterThanOrEqual(2);

    const baselineBlocks = (
      await readVisibleBlockBounds(page, "baseline", "unpinned")
    ).slice(0, 2);
    expect(baselineBlocks).toHaveLength(2);

    await openAllSettingsLivePixiCanary(page);
    await expect
      .poll(async () => readViewportTransform(page))
      .toEqual(baselineViewport);

    await expect
      .poll(async () => {
        const visibleCanaryBlocks = await readVisibleBlockBounds(
          page,
          "pixi",
          "unpinned",
        );
        const visibleCanaryKeys = new Set(
          visibleCanaryBlocks.map((block) => getBlockKey(block)),
        );

        return baselineBlocks.every((block) =>
          visibleCanaryKeys.has(getBlockKey(block)),
        );
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const canaryBlocks = await readVisibleBlockBounds(
          page,
          "pixi",
          "unpinned",
        );
        const canaryBlocksByKey = new Map(
          canaryBlocks.map((block) => [getBlockKey(block), block]),
        );

        return baselineBlocks.reduce((maxDelta, baselineBlock) => {
          const canaryBlock = canaryBlocksByKey.get(getBlockKey(baselineBlock));
          if (!canaryBlock) {
            return Number.POSITIVE_INFINITY;
          }

          return Math.max(
            maxDelta,
            Math.abs(canaryBlock.x - baselineBlock.x),
            Math.abs(canaryBlock.y - baselineBlock.y),
            Math.abs(canaryBlock.width - baselineBlock.width),
            Math.abs(canaryBlock.height - baselineBlock.height),
          );
        }, 0);
      })
      .toBeLessThanOrEqual(2);
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
  }
});

test("all settings baseline and live Pixi canary share the fit-view zoom-floor state after clearing the stored viewport", async ({
  page,
}) => {
  await openAllSettingsBaseline(page);

  const initialViewport = await readViewportTransform(page);
  expect(initialViewport.zoom).toBeGreaterThan(0);
  const projectConfigId = await getCurrentProjectConfigId(page);

  try {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });

    await openAllSettingsBaseline(page);
    await expectZoomOutButtonDisabled(page, true);

    const fitViewViewport = await readViewportTransform(page);
    expect(fitViewViewport.zoom).toBeGreaterThan(0);

    await openAllSettingsLivePixiCanary(page);
    await expect
      .poll(async () => readViewportTransform(page))
      .toEqual(fitViewViewport);
    await expectZoomOutButtonDisabled(page, true);
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialViewport,
    });
  }
});

test("all settings canary keeps visible unpinned live card anchors stable through a zoom-in interaction", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const zoomInButton = page.getByRole("button", { name: "zoom in" });
  const sceneCanvas = page
    .locator("[data-live-dict-area-scene='pixi'] canvas")
    .first();
  await expect(zoomInButton).toBeVisible();
  await expect(sceneCanvas).toBeVisible();

  await expect
    .poll(async () => {
      return (await readVisibleBlockBounds(page, "pixi", "unpinned")).length;
    })
    .toBeGreaterThanOrEqual(2);

  const initialCanvasWidth = await sceneCanvas.evaluate(
    (canvas) => canvas.width,
  );
  const initialBlocks = (await readVisibleBlockBounds(page, "pixi", "unpinned"))
    .slice(0, 4)
    .map((block) => ({
      ...block,
      key: getBlockKey(block),
    }));
  expect(initialBlocks.length).toBeGreaterThanOrEqual(2);

  await zoomInButton.click();

  await expect
    .poll(() => sceneCanvas.evaluate((canvas) => canvas.width), {
      message: "expected the Pixi scene canvas to redraw after zooming in",
    })
    .toBeGreaterThan(initialCanvasWidth);

  await expect
    .poll(async () => {
      const visibleCanaryBlocks = await readVisibleBlockBounds(
        page,
        "pixi",
        "unpinned",
      );
      const visibleCanaryKeys = new Set(
        visibleCanaryBlocks.map((block) => getBlockKey(block)),
      );

      return initialBlocks.some((block) => visibleCanaryKeys.has(block.key));
    })
    .toBe(true);

  // Keep at least one of the previously visible cards on-screen and make sure
  // its anchor grows with the zoomed scene instead of disappearing or
  // shrinking during the redraw.
  await expect
    .poll(async () => {
      const canaryBlocks = await readVisibleBlockBounds(
        page,
        "pixi",
        "unpinned",
      );
      const canaryBlocksByKey = new Map(
        canaryBlocks.map((block) => [getBlockKey(block), block]),
      );
      const sharedBlocks = initialBlocks.filter((block) =>
        canaryBlocksByKey.has(block.key),
      );

      if (sharedBlocks.length === 0) {
        return false;
      }

      return sharedBlocks.every((initialBlock) => {
        const zoomedBlock = canaryBlocksByKey.get(initialBlock.key);
        if (!zoomedBlock) {
          return false;
        }

        return (
          zoomedBlock.width > initialBlock.width &&
          zoomedBlock.height > initialBlock.height
        );
      });
    })
    .toBe(true);
});

test("all settings canary can hand off from the Pixi scene into a value-row DOM editor overlay", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator("[data-live-dict-area-editor-handoff='value-row']")
    .first();
  await expect(handoffButton).toBeVisible();
  const activatedRowId = await handoffButton.getAttribute(
    "data-live-dict-area-editor-handoff-row-id",
  );
  expect(activatedRowId).not.toBeNull();
  await handoffButton.click();

  await page.waitForSelector(
    `[data-live-dict-area-editor-overlay='active'][data-live-dict-area-editor-overlay-row-id='${activatedRowId}']`,
  );

  const overlayMetrics = await page.waitForFunction((rowId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-editor-overlay='active'][data-live-dict-area-editor-overlay-row-id='${rowId}']`,
    );
    if (!overlay) {
      return null;
    }

    return {
      localParamContainerCount: overlay.querySelectorAll(
        '[id^="ParamContainer-"]',
      ).length,
      localParamSwitchCount: overlay.querySelectorAll(
        "[data-param-switch-row-id]",
      ).length,
      overlayRowCount: overlay.querySelectorAll(
        "[data-live-dict-area-editor-overlay-row='true']",
      ).length,
      sceneCanvasCount: document.querySelectorAll(
        "[data-live-dict-area-scene='pixi'] canvas",
      ).length,
    };
  }, activatedRowId);

  const result = await overlayMetrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.localParamContainerCount).toBe(1);
  expect(result?.localParamSwitchCount).toBe(0);
  expect(result?.overlayRowCount).toBe(1);
  expect(result?.sceneCanvasCount).toBeGreaterThan(0);
});

test("all settings canary exposes hover, focus, and press value-row state on the scene host", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator("[data-live-dict-area-editor-handoff='value-row']")
    .first();
  await handoffButton.scrollIntoViewIfNeeded();
  await expect(handoffButton).toBeVisible();

  const activatedRowId = await handoffButton.getAttribute(
    "data-live-dict-area-editor-handoff-row-id",
  );
  const sectionId = await handoffButton.evaluate((button) =>
    button.closest("[data-section-id]")?.getAttribute("data-section-id"),
  );

  expect(activatedRowId).not.toBeNull();
  expect(sectionId).not.toBeNull();

  const scene = page.locator(
    `[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id='${sectionId}']`,
  );

  await expect(scene).toHaveCount(1);
  await handoffButton.hover();
  await expect(scene).toHaveAttribute(
    "data-live-dict-area-scene-value-hovered-row-id",
    activatedRowId!,
  );

  await handoffButton.focus();
  await expect(scene).toHaveAttribute(
    "data-live-dict-area-scene-value-focused-row-id",
    activatedRowId!,
  );

  await handoffButton.dispatchEvent("mousedown");
  await expect(scene).toHaveAttribute(
    "data-live-dict-area-scene-value-pressed-row-id",
    activatedRowId!,
  );

  await handoffButton.dispatchEvent("mouseup");
  await expect(scene).not.toHaveAttribute(
    "data-live-dict-area-scene-value-pressed-row-id",
    activatedRowId!,
  );
});

test("all settings canary can immediately activate a CodeMirror-backed value row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='codemirror']",
    )
    .first();
  await handoffButton.scrollIntoViewIfNeeded();
  await expect(handoffButton).toBeVisible();
  const activatedRowId = await handoffButton.getAttribute(
    "data-live-dict-area-editor-handoff-row-id",
  );
  expect(activatedRowId).not.toBeNull();
  await handoffButton.click();

  const activationMetrics = await page.waitForFunction((rowId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-editor-overlay='active'][data-live-dict-area-editor-overlay-row-id='${rowId}']`,
    );
    if (!overlay) {
      return null;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const codeMirrorEditor = overlay.querySelector<HTMLElement>(".cm-editor");

    if (
      overlay.getAttribute("data-live-dict-area-editor-overlay-editor-kind") !==
        "codemirror" ||
      codeMirrorEditor === null ||
      !activeElement?.closest(".cm-editor")
    ) {
      return null;
    }

    return {
      activeElementInsideCodeMirror: true,
      codeMirrorHeight: codeMirrorEditor.getBoundingClientRect().height,
      editorKind: "codemirror",
      hasCodeMirrorEditor: true,
      overlayHeight: overlay.getBoundingClientRect().height,
      overlayRowSurface:
        overlay
          .querySelector("[data-live-dict-area-editor-overlay-row='true']")
          ?.getAttribute("data-live-dict-area-editor-overlay-row-surface") ??
        null,
      overlayWidth: overlay.getBoundingClientRect().width,
    };
  }, activatedRowId);

  const codemirrorActivationResult = await activationMetrics.jsonValue();

  expect(codemirrorActivationResult).not.toBeNull();
  expect(codemirrorActivationResult?.editorKind).toBe("codemirror");
  expect(codemirrorActivationResult?.hasCodeMirrorEditor).toBe(true);
  expect(codemirrorActivationResult?.activeElementInsideCodeMirror).toBe(true);
  expect(codemirrorActivationResult?.overlayRowSurface).toBe("value-only");
  expect(codemirrorActivationResult?.overlayWidth).toBeGreaterThan(120);
  expect(codemirrorActivationResult?.overlayHeight).toBeGreaterThan(16);
  expect(codemirrorActivationResult?.codeMirrorHeight).toBeGreaterThan(12);

  const performanceSnapshot = await page.waitForFunction(
    ({ names, rowId }) => {
      const getLastEntry = (name: string, type: "mark" | "measure") => {
        const entries = performance.getEntriesByName(name, type);
        return entries.length > 0 ? entries.at(-1) ?? null : null;
      };
      const readDetail = (entry: PerformanceEntry | null) => {
        if (!entry || !("detail" in entry)) {
          return null;
        }
        return entry.detail as
          | { editorKind?: string; rowId?: string }
          | null
          | undefined;
      };

      const startMark = getLastEntry(names.startMark, "mark");
      const presentedMark = getLastEntry(names.presentedMark, "mark");
      const readyMark = getLastEntry(names.readyMark, "mark");
      const overlayMeasure = getLastEntry(names.overlayMeasure, "measure");
      const presentedMeasure = getLastEntry(names.presentedMeasure, "measure");
      const presentationTailMeasure = getLastEntry(
        names.presentationTailMeasure,
        "measure",
      );
      const readyMeasure = getLastEntry(names.readyMeasure, "measure");
      const startDetail = readDetail(startMark);
      const presentedDetail = readDetail(presentedMark);
      const readyDetail = readDetail(readyMark);

      if (
        !overlayMeasure ||
        !presentedMeasure ||
        !presentationTailMeasure ||
        !readyMeasure ||
        startDetail?.rowId !== rowId ||
        presentedDetail?.rowId !== rowId ||
        readyDetail?.rowId !== rowId
      ) {
        return null;
      }

      return {
        overlayDuration: overlayMeasure.duration,
        presentationTailDuration: presentationTailMeasure.duration,
        presentedDuration: presentedMeasure.duration,
        presentedEditorKind: presentedDetail?.editorKind ?? null,
        presentedRowId: presentedDetail?.rowId ?? null,
        readyDuration: readyMeasure.duration,
        readyEditorKind: readyDetail?.editorKind ?? null,
        readyRowId: readyDetail?.rowId ?? null,
        startEditorKind: startDetail?.editorKind ?? null,
        startRowId: startDetail?.rowId ?? null,
      } satisfies ValueRowPerfSnapshot;
    },
    {
      names: {
        overlayMeasure:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
        presentationTailMeasure:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
        presentedMark:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
        presentedMeasure:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
        readyMark: LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
        readyMeasure: LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
        startMark: LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
      },
      rowId: activatedRowId,
    },
  );

  const handoffPerf = await performanceSnapshot.jsonValue();

  expect(handoffPerf).not.toBeNull();
  expect(handoffPerf?.startEditorKind).toBe("codemirror");
  expect(handoffPerf?.startRowId).toBe(activatedRowId);
  expect(handoffPerf?.readyEditorKind).toBe("codemirror");
  expect(handoffPerf?.readyRowId).toBe(activatedRowId);
  expect(handoffPerf?.presentedEditorKind).toBe("codemirror");
  expect(handoffPerf?.presentedRowId).toBe(activatedRowId);
  expect(handoffPerf?.overlayDuration).toBeGreaterThanOrEqual(0);
  expect(handoffPerf?.readyDuration).toBeGreaterThanOrEqual(
    handoffPerf?.overlayDuration ?? 0,
  );
  expect(handoffPerf?.presentedDuration).toBeGreaterThanOrEqual(
    handoffPerf?.readyDuration ?? 0,
  );
  expect(handoffPerf?.presentationTailDuration).toBeGreaterThanOrEqual(0);
});

test("all settings canary can immediately open a combobox-backed value row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='combobox']",
    )
    .first();
  await expect(handoffButton).toBeVisible();
  await handoffButton.click();

  const activationMetrics = await page.waitForFunction(() => {
    const overlay = document.querySelector<HTMLElement>(
      "[data-live-dict-area-editor-overlay='active']",
    );
    if (!overlay) {
      return null;
    }

    const visibleMenu = Array.from(
      document.body.querySelectorAll<HTMLDivElement>("div.nowheel.nodrag"),
    ).find((menu) => getComputedStyle(menu).display !== "none");
    const comboboxInput = overlay.querySelector<HTMLInputElement>("input");

    return {
      activeElementInsideComboboxInput:
        comboboxInput !== null && document.activeElement === comboboxInput,
      editorKind: overlay.getAttribute(
        "data-live-dict-area-editor-overlay-editor-kind",
      ),
      openMenuItemCount: visibleMenu?.querySelectorAll("dd").length ?? 0,
    };
  });

  const comboboxActivationResult = await activationMetrics.jsonValue();

  expect(comboboxActivationResult).not.toBeNull();
  expect(comboboxActivationResult?.editorKind).toBe("combobox");
  expect(comboboxActivationResult?.activeElementInsideComboboxInput).toBe(true);
  expect(comboboxActivationResult?.openMenuItemCount).toBeGreaterThan(0);
});

test("all settings canary can immediately open a popup color-picker row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const colorPickerHandoffButtons = page.locator(
    "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='color-picker']",
  );
  const visibleColorPickerHandoffLabels =
    await colorPickerHandoffButtons.evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const style = window.getComputedStyle(button);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            button.getBoundingClientRect().height > 0
          );
        })
        .map((button) => button.getAttribute("aria-label") ?? ""),
    );

  expect(visibleColorPickerHandoffLabels.length).toBeGreaterThan(0);
  visibleColorPickerHandoffLabels.forEach((handoffAriaLabel) => {
    expect(handoffAriaLabel).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  const handoffButton = colorPickerHandoffButtons.first();
  await handoffButton.scrollIntoViewIfNeeded();
  await expect(handoffButton).toBeVisible();
  await handoffButton.click();

  const activationMetrics = await page.waitForFunction(() => {
    const overlay = document.querySelector<HTMLElement>(
      "[data-live-dict-area-editor-overlay='active']",
    );
    if (!overlay) {
      return null;
    }

    const paletteLabels = new Set([
      "Red",
      "Orange",
      "Yellow",
      "Green",
      "Cyan",
      "Blue",
      "Purple",
      "Slate",
    ]);
    const visibleMenuItems = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role='menuitem']"),
    ).filter((item) => {
      const style = getComputedStyle(item);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const visiblePaletteLabels = visibleMenuItems
      .map((item) => item.textContent?.trim() ?? "")
      .filter((label) => paletteLabels.has(label));

    return {
      editorKind: overlay.getAttribute(
        "data-live-dict-area-editor-overlay-editor-kind",
      ),
      openPaletteItemCount: visiblePaletteLabels.length,
      visiblePaletteLabels,
    };
  });

  const colorPickerActivationResult = await activationMetrics.jsonValue();

  expect(colorPickerActivationResult).not.toBeNull();
  expect(colorPickerActivationResult?.editorKind).toBe("color-picker");
  expect(colorPickerActivationResult?.openPaletteItemCount).toBeGreaterThan(0);
  expect(colorPickerActivationResult?.visiblePaletteLabels).toContain("Red");
});

test("all settings canary can opt into param-select mode through the canary query param for drag-overlay inspection", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page, {
    interactionMode: "param-select",
  });

  const dragHandoffButton = page
    .locator("[data-live-dict-area-drag-handoff='param-row']")
    .first();
  await expect(dragHandoffButton).toBeVisible();
  const activatedBlockId = await dragHandoffButton.getAttribute(
    "data-live-dict-area-drag-handoff-block-id",
  );
  expect(activatedBlockId).not.toBeNull();

  await dragHandoffButton.click();

  await page.waitForSelector(
    `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
  );

  const dragOverlayMetrics = await page.waitForFunction((blockId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${blockId}']`,
    );
    if (!overlay) {
      return null;
    }

    return {
      dragOverlayKind: overlay.getAttribute(
        "data-live-dict-area-drag-overlay-kind",
      ),
      dragOverlayRowRenderModeCount: overlay.querySelectorAll(
        "[data-param-render-mode='drag-overlay']",
      ).length,
      dragParamRowCount: overlay.querySelectorAll("[data-param-row='true']")
        .length,
      interactiveControlCount: overlay.querySelectorAll(
        "input, textarea, [role='combobox'], .cm-editor",
      ).length,
      sceneCanvasCount: document.querySelectorAll(
        "[data-live-dict-area-scene='pixi'] canvas",
      ).length,
    };
  }, activatedBlockId);

  const result = await dragOverlayMetrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.dragOverlayKind).toBe("param-list");
  expect(result?.dragOverlayRowRenderModeCount).toBeGreaterThan(0);
  expect(result?.dragParamRowCount).toBeGreaterThan(1);
  expect(result?.interactiveControlCount).toBe(0);
  expect(result?.sceneCanvasCount).toBeGreaterThan(0);
});

test("all settings canary can hand off from the Pixi scene into a param-list drag overlay while param select is active", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  await withParamSelectHeld(page, async () => {
    const dragHandoffButton = page
      .locator("[data-live-dict-area-drag-handoff='param-row']")
      .first();
    await expect(dragHandoffButton).toBeVisible();
    const activatedRowId = await dragHandoffButton.getAttribute(
      "data-live-dict-area-drag-handoff-row-id",
    );
    const activatedBlockId = await dragHandoffButton.getAttribute(
      "data-live-dict-area-drag-handoff-block-id",
    );
    expect(activatedRowId).not.toBeNull();
    expect(activatedBlockId).not.toBeNull();

    await dragHandoffButton.click();

    await page.waitForSelector(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );

    const dragOverlayMetrics = await page.waitForFunction((blockId) => {
      const overlay = document.querySelector<HTMLElement>(
        `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${blockId}']`,
      );
      if (!overlay) {
        return null;
      }

      return {
        dragOverlayKind: overlay.getAttribute(
          "data-live-dict-area-drag-overlay-kind",
        ),
        dragOverlayRowRenderModeCount: overlay.querySelectorAll(
          "[data-param-render-mode='drag-overlay']",
        ).length,
        dragParamRowCount: overlay.querySelectorAll("[data-param-row='true']")
          .length,
        hasBlockFrameMount:
          overlay.querySelector("[data-dict-area-block-frame-id]") !== null,
        hasHeaderMount: overlay.querySelector("header") !== null,
        interactiveControlCount: overlay.querySelectorAll(
          "input, textarea, [role='combobox'], .cm-editor",
        ).length,
        mountedParamContainerCount: overlay.querySelectorAll(
          '[id^="ParamContainer-"]',
        ).length,
        sceneCanvasCount: document.querySelectorAll(
          "[data-live-dict-area-scene='pixi'] canvas",
        ).length,
      };
    }, activatedBlockId);

    const result = await dragOverlayMetrics.jsonValue();

    expect(result).not.toBeNull();
    expect(result?.dragOverlayKind).toBe("param-list");
    expect(result?.dragOverlayRowRenderModeCount).toBeGreaterThan(0);
    expect(result?.dragParamRowCount).toBeGreaterThan(1);
    expect(result?.hasBlockFrameMount).toBe(false);
    expect(result?.hasHeaderMount).toBe(false);
    expect(result?.interactiveControlCount).toBe(0);
    expect(result?.mountedParamContainerCount).toBe(0);
    expect(result?.sceneCanvasCount).toBeGreaterThan(0);
  });
});

test("all settings canary can reorder top-level rows through the Pixi param-list drag overlay", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  let activatedBlockId: string | null = null;
  let reorderedRowIds: string[] | null = null;
  let sourceRowId: string | null = null;
  let targetRowId: string | null = null;

  await withParamSelectHeld(page, async () => {
    const dragHandoffButton = page
      .locator("[data-live-dict-area-drag-handoff='param-row']")
      .first();
    await expect(dragHandoffButton).toBeVisible();
    activatedBlockId = await dragHandoffButton.getAttribute(
      "data-live-dict-area-drag-handoff-block-id",
    );
    expect(activatedBlockId).not.toBeNull();

    await dragHandoffButton.click();
    await page.waitForSelector(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );

    const initialRows = await readActiveOverlayTopLevelRows(
      page,
      activatedBlockId!,
    );
    expect(initialRows.length).toBeGreaterThan(1);
    const initialRowIds = initialRows.map((row) => row.id);

    const preferredRows = initialRows.filter((row) => row.height <= 56);
    const draggableRows =
      preferredRows.length >= 2 ? preferredRows : initialRows;

    targetRowId = draggableRows[0]?.id ?? null;
    sourceRowId = draggableRows[1]?.id ?? null;
    expect(targetRowId).not.toBeNull();
    expect(sourceRowId).not.toBeNull();

    const activeOverlay = page.locator(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );
    const targetRow = activeOverlay
      .locator(
        `[data-live-dict-area-drag-overlay-row-id='${targetRowId}'][data-live-dict-area-scene-row-depth='0']`,
      )
      .first();
    const sourceRow = activeOverlay
      .locator(
        `[data-live-dict-area-drag-overlay-row-id='${sourceRowId}'][data-live-dict-area-scene-row-depth='0']`,
      )
      .first();
    await targetRow.scrollIntoViewIfNeeded();
    await sourceRow.scrollIntoViewIfNeeded();
    await expect(targetRow).toBeVisible();
    await expect(sourceRow).toBeVisible();

    await dragLocatorBefore(page, sourceRow, targetRow);

    await expect
      .poll(async () => {
        const rowIds = (
          await readActiveOverlayTopLevelRows(page, activatedBlockId!)
        ).map((row) => row.id);
        return rowIds.join("|") !== initialRowIds.join("|");
      })
      .toBe(true);

    reorderedRowIds = (
      await readActiveOverlayTopLevelRows(page, activatedBlockId!)
    ).map((row) => row.id);
  });

  expect(activatedBlockId).not.toBeNull();
  expect(reorderedRowIds).not.toBeNull();
  expect(sourceRowId).not.toBeNull();
  expect(targetRowId).not.toBeNull();

  await withParamSelectHeld(page, async () => {
    const sameBlockHandoff = page
      .locator(
        `[data-live-dict-area-drag-handoff='param-row'][data-live-dict-area-drag-handoff-block-id='${activatedBlockId}']`,
      )
      .first();
    await expect(sameBlockHandoff).toBeVisible();
    await sameBlockHandoff.click();

    await page.waitForSelector(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );

    const reopenedRowIds = (
      await readActiveOverlayTopLevelRows(page, activatedBlockId!)
    ).map((row) => row.id);

    expect(reopenedRowIds).toEqual(reorderedRowIds!);
  });
});
