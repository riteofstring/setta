import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      topLevelSections?: Record<
        string,
        {
          x?: number;
          y?: number;
          w?: number | null;
          h?: number | null;
          zIndex?: number;
        }
      >;
      sectionVariantMap?: Record<string, string>;
      viewport?: {
        x?: number;
        y?: number;
        zoom?: number;
      } | null;
    };
    sectionVariants?: Record<
      string,
      {
        impl?: string;
      }
    >;
    sections?: Record<
      string,
      {
        sharedModifier?: {
          size?: {
            width?: number | "auto";
            height?: number | "auto";
          } | null;
        };
      }
    >;
    sectionImpls?: Record<
      string,
      {
        size?: {
          width?: number | "auto";
          height?: number | "auto";
        } | null;
      }
    >;
  };
};

type CanvasEngineCameraSnapshot = {
  x: number;
  y: number;
  zoom: number;
};

type WorldPoint = {
  x: number;
  y: number;
};

const MULTI_SELECTION_MODIFIER_KEY =
  process.platform === "darwin" ? "Meta" : "Control";

test("canvas engine host mounts visible top-level sections as dom islands", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);

    const sectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );

    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(host, "data-canvas-engine-rect-count"),
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(
            host,
            "data-canvas-engine-dom-island-mounted-count",
          ),
      )
      .toBeGreaterThanOrEqual(1);
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${sectionId}"]`),
    ).toHaveCount(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host persists camera viewport after pan and zoom", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);

    const hostBounds = await host.boundingBox();
    if (!hostBounds) {
      throw new Error("Unable to resolve canvas host bounds.");
    }
    const cameraBefore = await readCamera(host);
    const panePoint = await resolvePaneScreenPoint(page, host);

    const panEnd = {
      x: panePoint.x - 180,
      y: panePoint.y + 120,
    };
    await page.mouse.move(panePoint.x, panePoint.y);
    await page.mouse.down();
    await page.mouse.move(panEnd.x, panEnd.y, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const cameraAfterPan = await readCamera(host);
        return (
          Math.abs(cameraAfterPan.x - cameraBefore.x) > 0.5 ||
          Math.abs(cameraAfterPan.y - cameraBefore.y) > 0.5
        );
      })
      .toBe(true);

    await page.mouse.move(panePoint.x, panePoint.y);
    await page.mouse.wheel(0, -600);

    await expect
      .poll(async () => (await readCamera(host)).zoom)
      .toBeGreaterThan(cameraBefore.zoom + 0.05);

    await expect
      .poll(
        async () => {
          const camera = await readCamera(host);
          const persistedViewport = await readPersistedViewport(
            page,
            projectContext.projectConfigId,
          );
          if (!persistedViewport) {
            return false;
          }
          return areCamerasClose(camera, persistedViewport);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host clears active sections on blank pane click", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const sectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    const sectionIsland = host.locator(
      `[data-canvas-engine-dom-island="${sectionId}"]`,
    );
    await expect(sectionIsland).toHaveCount(1);
    await dispatchMountedSectionRootClick(page, sectionId);

    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([sectionId]);

    const panePoint = await resolvePaneScreenPoint(page, host);
    await page.mouse.click(panePoint.x, panePoint.y);

    await expect.poll(async () => await readActiveSectionIds(host)).toEqual([]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host ignores section-control clicks for canvas selection", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const firstSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    const secondSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${firstSectionId}"]`),
    ).toHaveCount(1);
    const secondSectionMenuItems = host.locator(
      `[data-canvas-engine-dom-island="${secondSectionId}"] [role="menuitem"]`,
    );
    await expect
      .poll(async () => await secondSectionMenuItems.count())
      .toBeGreaterThan(0);

    // Section controls inside a different island should not steal selection
    // from the currently active section.
    await dispatchMountedSectionRootClick(page, firstSectionId);
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await secondSectionMenuItems.first().click();

    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host preserves modifier-click multi-section selection", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const firstSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    const secondSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${secondSectionId}"]`),
    ).toHaveCount(1);

    await dispatchMountedSectionRootClick(page, firstSectionId);
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await page.keyboard.down(MULTI_SELECTION_MODIFIER_KEY);
    try {
      await dispatchMountedSectionRootClick(page, secondSectionId);
      await expect
        .poll(async () => await readActiveSectionIds(host))
        .toEqual([firstSectionId, secondSectionId]);

      await dispatchMountedSectionRootClick(page, firstSectionId);
      await expect
        .poll(async () => await readActiveSectionIds(host))
        .toEqual([secondSectionId]);
    } finally {
      await page.keyboard.up(MULTI_SELECTION_MODIFIER_KEY);
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host drags sections and persists top-level layout", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const sectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${sectionId}"]`),
    ).toHaveCount(1);

    const initialPosition = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const dragDelta = { x: 120, y: 80 };

    await dragWorldPoint(page, host, {
      start: {
        x: initialPosition.x + 140,
        y: initialPosition.y + 110,
      },
      end: {
        x: initialPosition.x + 140 + dragDelta.x,
        y: initialPosition.y + 110 + dragDelta.y,
      },
    });

    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([sectionId]);
    await expect
      .poll(
        async () =>
          await readTopLevelSectionPosition(
            page,
            projectContext.projectConfigId,
            sectionId,
          ),
      )
      .toEqual({
        x: initialPosition.x + dragDelta.x,
        y: initialPosition.y + dragDelta.y,
      });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host drags selected section groups together", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const firstSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    const secondSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${secondSectionId}"]`),
    ).toHaveCount(1);

    const firstLayoutBefore = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    const secondLayoutBefore = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      secondSectionId,
    );

    await dispatchMountedSectionRootClick(page, firstSectionId);
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await page.keyboard.down(MULTI_SELECTION_MODIFIER_KEY);
    try {
      await dispatchMountedSectionRootClick(page, secondSectionId);
    } finally {
      await page.keyboard.up(MULTI_SELECTION_MODIFIER_KEY);
    }
    await expect
      .poll(async () => [...(await readActiveSectionIds(host))].sort())
      .toEqual([firstSectionId, secondSectionId].sort());

    const dragDelta = { x: 140, y: 90 };
    await dragWorldPoint(page, host, {
      start: {
        x: firstLayoutBefore.x + 140,
        y: firstLayoutBefore.y + 110,
      },
      end: {
        x: firstLayoutBefore.x + 140 + dragDelta.x,
        y: firstLayoutBefore.y + 110 + dragDelta.y,
      },
    });

    await expect
      .poll(async () => {
        const firstLayoutAfter = await readTopLevelSectionPosition(
          page,
          projectContext.projectConfigId,
          firstSectionId,
        );
        const secondLayoutAfter = await readTopLevelSectionPosition(
          page,
          projectContext.projectConfigId,
          secondSectionId,
        );
        return {
          firstDeltaX: firstLayoutAfter.x - firstLayoutBefore.x,
          firstDeltaY: firstLayoutAfter.y - firstLayoutBefore.y,
          secondDeltaX: secondLayoutAfter.x - secondLayoutBefore.x,
          secondDeltaY: secondLayoutAfter.y - secondLayoutBefore.y,
        };
      })
      .toEqual({
        firstDeltaX: dragDelta.x,
        firstDeltaY: dragDelta.y,
        secondDeltaX: dragDelta.x,
        secondDeltaY: dragDelta.y,
      });
    await expect
      .poll(async () => [...(await readActiveSectionIds(host))].sort())
      .toEqual([firstSectionId, secondSectionId].sort());
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host resizes sections and persists top-level layout", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const sectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${sectionId}"]`),
    ).toHaveCount(1);

    const layoutBefore = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const sectionBounds = await host
      .locator(`[data-canvas-engine-dom-island="${sectionId}"]`)
      .boundingBox();
    if (!sectionBounds) {
      throw new Error(`Missing DOM-island bounds for section ${sectionId}.`);
    }
    const initialWidth = Math.round(sectionBounds.width);
    const initialHeight = Math.round(sectionBounds.height);
    const resizeDelta = { width: 80, height: 60 };

    await page.mouse.move(
      sectionBounds.x + sectionBounds.width - 2,
      sectionBounds.y + sectionBounds.height - 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      sectionBounds.x + sectionBounds.width - 2 + resizeDelta.width,
      sectionBounds.y + sectionBounds.height - 2 + resizeDelta.height,
      { steps: 10 },
    );
    await page.mouse.up();

    await expect
      .poll(
        async () =>
          await readTopLevelSectionLayout(
            page,
            projectContext.projectConfigId,
            sectionId,
          ),
      )
      .toEqual({
        x: layoutBefore.x,
        y: layoutBefore.y,
        w: initialWidth + resizeDelta.width,
        h: initialHeight + resizeDelta.height,
      });
    await expect
      .poll(
        async () =>
          await readPersistedSectionSize(
            page,
            projectContext.projectConfigId,
            sectionId,
          ),
      )
      .toEqual({
        width: initialWidth + resizeDelta.width,
        height: initialHeight + resizeDelta.height,
      });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function readCamera(host: Locator): Promise<CanvasEngineCameraSnapshot> {
  const xRaw = await host.getAttribute("data-canvas-engine-camera-x");
  const yRaw = await host.getAttribute("data-canvas-engine-camera-y");
  const zoomRaw = await host.getAttribute("data-canvas-engine-camera-zoom");
  const x = Number(xRaw);
  const y = Number(yRaw);
  const zoom = Number(zoomRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    throw new Error(
      `Invalid camera attributes: x=${String(xRaw)}, y=${String(yRaw)}, zoom=${String(zoomRaw)}`,
    );
  }
  return { x, y, zoom };
}

async function createCallableSectionForCanvasEngine(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const viewportBounds = await page.evaluate(() => ({
    x: 0,
    y: 0,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
      viewportBounds,
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }
  return response.sectionId;
}

function areCamerasClose(
  left: CanvasEngineCameraSnapshot,
  right: CanvasEngineCameraSnapshot,
): boolean {
  return (
    Math.abs(left.x - right.x) <= 0.75 &&
    Math.abs(left.y - right.y) <= 0.75 &&
    Math.abs(left.zoom - right.zoom) <= 0.02
  );
}

async function readPersistedViewport(
  page: Page,
  projectConfigId: string,
): Promise<CanvasEngineCameraSnapshot | null> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const viewport = response?.projectState?.projectConfig?.viewport ?? null;
  if (viewport === null) {
    return null;
  }
  if (
    typeof viewport.x !== "number" ||
    typeof viewport.y !== "number" ||
    typeof viewport.zoom !== "number"
  ) {
    throw new Error(
      `Invalid persisted viewport for project ${projectConfigId}: ${JSON.stringify(viewport)}`,
    );
  }
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
  };
}

async function readTopLevelSectionPosition(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{ x: number; y: number }> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const layout =
    response?.projectState?.projectConfig?.topLevelSections?.[sectionId];
  if (!layout || typeof layout.x !== "number" || typeof layout.y !== "number") {
    throw new Error(
      `Missing top-level layout for section ${sectionId} in project ${projectConfigId}.`,
    );
  }
  return {
    x: layout.x,
    y: layout.y,
  };
}

async function readTopLevelSectionLayout(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const layout =
    response?.projectState?.projectConfig?.topLevelSections?.[sectionId];
  if (
    !layout ||
    typeof layout.x !== "number" ||
    typeof layout.y !== "number" ||
    typeof layout.w !== "number" ||
    typeof layout.h !== "number"
  ) {
    throw new Error(
      `Missing top-level layout for section ${sectionId} in project ${projectConfigId}.`,
    );
  }
  return {
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
  };
}

async function readPersistedSectionSize(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{ width: number; height: number }> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const variantId =
    response?.projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  const sharedModifierSize =
    response?.projectState?.sections?.[sectionId]?.sharedModifier?.size;
  const implId = variantId
    ? response?.projectState?.sectionVariants?.[variantId]?.impl
    : null;
  const size =
    sharedModifierSize ??
    (implId ? response?.projectState?.sectionImpls?.[implId]?.size : null);
  if (
    !size ||
    typeof size.width !== "number" ||
    typeof size.height !== "number"
  ) {
    throw new Error(
      `Missing persisted size for section ${sectionId} in project ${projectConfigId}.`,
    );
  }
  return {
    width: size.width,
    height: size.height,
  };
}

async function readActiveSectionIds(host: Locator): Promise<string[]> {
  const value = await host.getAttribute(
    "data-canvas-engine-active-section-ids",
  );
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((sectionId) => sectionId.trim())
    .filter((sectionId) => sectionId.length > 0);
}

async function dispatchMountedSectionRootClick(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate((nextSectionId) => {
    const sectionRoot = document.querySelector(
      `[data-canvas-engine-dom-island="${nextSectionId}"] [data-section-id="${nextSectionId}"]`,
    );
    if (!(sectionRoot instanceof HTMLElement)) {
      throw new Error(`Missing mounted section root for ${nextSectionId}.`);
    }
    sectionRoot.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
  }, sectionId);
}

async function worldPointToScreen(
  host: Locator,
  worldPoint: WorldPoint,
): Promise<WorldPoint> {
  const hostBounds = await host.boundingBox();
  if (!hostBounds) {
    throw new Error("Unable to resolve canvas host bounds.");
  }
  const camera = await readCamera(host);
  return {
    x: hostBounds.x + (worldPoint.x - camera.x) * camera.zoom,
    y: hostBounds.y + (worldPoint.y - camera.y) * camera.zoom,
  };
}

async function dragWorldPoint(
  page: Page,
  host: Locator,
  points: {
    start: WorldPoint;
    end: WorldPoint;
  },
): Promise<void> {
  const startScreen = await worldPointToScreen(host, points.start);
  const endScreen = await worldPointToScreen(host, points.end);
  await page.mouse.move(startScreen.x, startScreen.y);
  await page.mouse.down();
  await page.mouse.move(endScreen.x, endScreen.y, { steps: 10 });
  await page.mouse.up();
}

async function readNumericHostAttribute(
  host: Locator,
  attributeName: string,
): Promise<number> {
  const value = await host.getAttribute(attributeName);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid numeric host attribute ${attributeName}: ${String(value)}`,
    );
  }
  return parsed;
}

async function resolvePaneScreenPoint(
  page: Page,
  host: Locator,
): Promise<{ x: number; y: number }> {
  const bounds = await host.boundingBox();
  if (!bounds) {
    throw new Error("Unable to resolve canvas host bounds for pane point.");
  }
  const xOffsets = [
    24,
    bounds.width * 0.2,
    bounds.width * 0.4,
    bounds.width * 0.6,
    bounds.width * 0.8,
    Math.max(24, bounds.width - 24),
  ];
  const yOffsets = [
    24,
    bounds.height * 0.2,
    bounds.height * 0.4,
    bounds.height * 0.6,
    bounds.height * 0.8,
    Math.max(24, bounds.height - 24),
  ];
  for (const yOffset of yOffsets) {
    for (const xOffset of xOffsets) {
      const point = { x: bounds.x + xOffset, y: bounds.y + yOffset };
      const isPanePoint = await page.evaluate((candidate) => {
        const target = document.elementFromPoint(candidate.x, candidate.y);
        if (!(target instanceof Element)) {
          return false;
        }
        if (!target.closest('[data-canvas-engine-host="v1"]')) {
          return false;
        }
        if (target.closest("[data-canvas-engine-dom-island]")) {
          return false;
        }
        if (
          target.closest(
            [
              "button",
              "a[href]",
              "input",
              "textarea",
              "select",
              "[role='button']",
              "[role='menuitem']",
            ].join(","),
          )
        ) {
          return false;
        }
        return true;
      }, point);
      if (isPanePoint) {
        return point;
      }
    }
  }
  throw new Error("Unable to resolve a pane screen point for canvas drag.");
}
