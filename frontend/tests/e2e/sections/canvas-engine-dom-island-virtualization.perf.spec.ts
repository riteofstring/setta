import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type FlowViewportBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
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

type DomIslandVirtualizationMetrics = {
  rectCount: number;
  mountedDomIslands: number;
  retainedDomIslands: number;
  visibleDomIslands: number;
  hiddenDomIslands: number;
  canvasDomNodeCount: number;
  totalDomNodeCount: number;
};

const STRESS_SECTION_COUNT = 300;
const STRESS_GRID_COLUMNS = 15;
const STRESS_GRID_X_GAP = 340;
const STRESS_GRID_Y_GAP = 240;
const DEFAULT_SECTION_WIDTH_FOR_HIT_TEST = 320;
const RETENTION_WAIT_BUFFER_MS = 900;

test("canvas engine dom-island virtualization guardrail with 300 sections", async ({
  page,
}, testInfo: TestInfo) => {
  test.setTimeout(10 * 60 * 1000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();
    await expect(page.locator(".react-flow__pane")).toHaveCount(1);

    const hostBounds = await host.boundingBox();
    if (!hostBounds) {
      throw new Error("Unable to resolve canvas host bounds.");
    }
    const camera = await readCamera(host);
    const basePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.52,
        y: hostBounds.y + hostBounds.height * 0.5,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    // Build a deterministic wide grid so most sections remain offscreen.
    for (let index = 0; index < STRESS_SECTION_COUNT; index += 1) {
      const column = index % STRESS_GRID_COLUMNS;
      const row = Math.floor(index / STRESS_GRID_COLUMNS);
      await createTopLevelSection({
        page,
        projectConfigId: projectContext.projectConfigId,
        implType: index % 2 === 0 ? "Callable" : "TextBlock",
        viewportBounds: engineViewportBounds,
        position: {
          x: basePosition.x + column * STRESS_GRID_X_GAP,
          y: basePosition.y + row * STRESS_GRID_Y_GAP,
        },
      });
    }

    await expect
      .poll(async () => await readRectCount(host), { timeout: 120_000 })
      .toBeGreaterThanOrEqual(STRESS_SECTION_COUNT);

    const retentionCap = await readDomIslandRetentionCap(host);
    expect(retentionCap).toBeGreaterThanOrEqual(1);
    const retentionMs = await readDomIslandRetentionMs(host);
    expect(retentionMs).toBeGreaterThan(0);

    const initialMetrics = await readVirtualizationMetrics(page, host);
    expect(initialMetrics.rectCount).toBeGreaterThanOrEqual(
      STRESS_SECTION_COUNT,
    );
    expect(initialMetrics.mountedDomIslands).toBeLessThan(STRESS_SECTION_COUNT);
    expect(initialMetrics.visibleDomIslands).toBeLessThan(STRESS_SECTION_COUNT);

    await clearSelectionByPaneClick(page, host);
    await expect.poll(async () => await readActiveSectionIds(host)).toEqual([]);

    const cameraBeforePan = await readCamera(host);
    const furthestSectionX =
      basePosition.x + (STRESS_GRID_COLUMNS - 1) * STRESS_GRID_X_GAP;
    const viewportWidthWorld = hostBounds.width / cameraBeforePan.zoom;
    const targetCameraX =
      furthestSectionX +
      DEFAULT_SECTION_WIDTH_FOR_HIT_TEST +
      viewportWidthWorld +
      600;
    const requiredCameraDeltaX = Math.max(0, targetCameraX - cameraBeforePan.x);
    if (requiredCameraDeltaX > 0) {
      await panCanvasHostByPixelDelta(page, host, {
        x: -Math.ceil(requiredCameraDeltaX * cameraBeforePan.zoom + 300),
        y: 0,
      });
    }

    await expect
      .poll(async () => await readDomIslandRetainedCount(host))
      .toBeLessThanOrEqual(retentionCap);
    await expect
      .poll(async () => await readDomIslandMountedCount(host))
      .toBeLessThanOrEqual(retentionCap);
    await expect
      .poll(async () => await readVisibleDomIslandCount(host))
      .toBeLessThanOrEqual(16);

    const postPanMetrics = await readVirtualizationMetrics(page, host);

    await page.waitForTimeout(retentionMs + RETENTION_WAIT_BUFFER_MS);
    await expect
      .poll(async () => await readDomIslandRetainedCount(host))
      .toBe(0);
    await expect
      .poll(async () => await readDomIslandMountedCount(host))
      .toBeLessThanOrEqual(16);
    await expect.poll(async () => await readHiddenDomIslandCount(host)).toBe(0);

    const postRetentionMetrics = await readVirtualizationMetrics(page, host);

    const metrics = {
      sectionCount: STRESS_SECTION_COUNT,
      retentionCap,
      retentionMs,
      initialMetrics,
      postPanMetrics,
      postRetentionMetrics,
    };

    testInfo.annotations.push({
      type: "canvas-engine-dom-island-virtualization",
      description: JSON.stringify(metrics),
    });
    await testInfo.attach("canvas-engine-dom-island-virtualization.json", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    console.log(
      `[canvas-engine-dom-island-virtualization] ${JSON.stringify(metrics)}`,
    );

    expect(postRetentionMetrics.canvasDomNodeCount).toBeLessThanOrEqual(
      initialMetrics.canvasDomNodeCount,
    );
    expect(postRetentionMetrics.hiddenDomIslands).toBe(0);
    expect(postRetentionMetrics.mountedDomIslands).toBeLessThanOrEqual(16);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function createTopLevelSection({
  page,
  projectConfigId,
  implType,
  position,
  viewportBounds,
}: {
  page: Page;
  projectConfigId: string;
  implType: string;
  position: WorldPoint;
  viewportBounds: FlowViewportBounds;
}): Promise<string> {
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      position,
      viewportBounds,
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error(`Missing sectionId for implType=${implType}.`);
  }
  return sectionId;
}

function screenToWorldPoint(
  screenPoint: { x: number; y: number },
  hostBounds: { x: number; y: number },
  camera: CanvasEngineCameraSnapshot,
): WorldPoint {
  return {
    x: camera.x + (screenPoint.x - hostBounds.x) / camera.zoom,
    y: camera.y + (screenPoint.y - hostBounds.y) / camera.zoom,
  };
}

async function getEngineViewportBounds(
  page: Page,
): Promise<FlowViewportBounds> {
  return await page.evaluate(() => ({
    x: 0,
    y: 0,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
}

async function readRectCount(host: Locator): Promise<number> {
  return await readNumericHostAttribute(host, "data-canvas-engine-rect-count");
}

async function readHiddenDomIslandCount(host: Locator): Promise<number> {
  return await host
    .locator('[data-canvas-engine-dom-island-retained="true"]')
    .count();
}

async function readVisibleDomIslandCount(host: Locator): Promise<number> {
  return await host
    .locator('[data-canvas-engine-dom-island-retained="false"]')
    .count();
}

async function readDomIslandMountedCount(host: Locator): Promise<number> {
  return await readNumericHostAttribute(
    host,
    "data-canvas-engine-dom-island-mounted-count",
  );
}

async function readDomIslandRetainedCount(host: Locator): Promise<number> {
  return await readNumericHostAttribute(
    host,
    "data-canvas-engine-dom-island-retained-count",
  );
}

async function readDomIslandRetentionMs(host: Locator): Promise<number> {
  return await readNumericHostAttribute(
    host,
    "data-canvas-engine-dom-island-retention-ms",
  );
}

async function readDomIslandRetentionCap(host: Locator): Promise<number> {
  return await readNumericHostAttribute(
    host,
    "data-canvas-engine-dom-island-retention-cap",
  );
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

async function readCamera(host: Locator): Promise<CanvasEngineCameraSnapshot> {
  const x = await readNumericHostAttribute(host, "data-canvas-engine-camera-x");
  const y = await readNumericHostAttribute(host, "data-canvas-engine-camera-y");
  const zoom = await readNumericHostAttribute(
    host,
    "data-canvas-engine-camera-zoom",
  );
  return { x, y, zoom };
}

async function clearSelectionByPaneClick(
  page: Page,
  host: Locator,
): Promise<void> {
  const hostBounds = await host.boundingBox();
  if (!hostBounds) {
    throw new Error("Unable to resolve canvas host bounds.");
  }
  await page.mouse.move(
    hostBounds.x + hostBounds.width * 0.08,
    hostBounds.y + hostBounds.height * 0.08,
  );
  await page.mouse.down();
  await page.mouse.up();
}

async function panCanvasHostByPixelDelta(
  page: Page,
  host: Locator,
  delta: { x: number; y: number },
): Promise<void> {
  const hostBounds = await host.boundingBox();
  if (!hostBounds) {
    throw new Error("Unable to resolve canvas host bounds.");
  }
  const start = {
    x: hostBounds.x + hostBounds.width * 0.7,
    y: hostBounds.y + hostBounds.height * 0.5,
  };
  const end = {
    x: start.x + delta.x,
    y: start.y + delta.y,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

async function readVirtualizationMetrics(
  page: Page,
  host: Locator,
): Promise<DomIslandVirtualizationMetrics> {
  const rectCount = await readRectCount(host);
  const mountedDomIslands = await readDomIslandMountedCount(host);
  const retainedDomIslands = await readDomIslandRetainedCount(host);
  const visibleDomIslands = await readVisibleDomIslandCount(host);
  const hiddenDomIslands = await readHiddenDomIslandCount(host);
  const canvasDomNodeCount = await host.evaluate((element) => {
    return element.querySelectorAll("*").length;
  });
  const totalDomNodeCount = await page.evaluate(() => {
    return document.querySelectorAll("*").length;
  });
  return {
    rectCount,
    mountedDomIslands,
    retainedDomIslands,
    visibleDomIslands,
    hiddenDomIslands,
    canvasDomNodeCount,
    totalDomNodeCount,
  };
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
