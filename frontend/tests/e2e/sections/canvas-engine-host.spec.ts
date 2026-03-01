import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type AgenticEdgeKind = "chat_chat" | "section_chat" | "chat_section";

type TopLevelSectionLayoutSnapshot = {
  x?: number;
  y?: number;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      topLevelSections?: Record<string, TopLevelSectionLayoutSnapshot>;
    };
  };
};

type FlowViewportBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type WorldPoint = {
  x: number;
  y: number;
};

type CanvasEngineCameraSnapshot = {
  x: number;
  y: number;
  zoom: number;
};

test("canvas engine host path mounts and tracks top-level section geometry", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);

  try {
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve initial viewport bounds.");
    }
    const createdTopLevelSectionIds: string[] = [];

    // Seed deterministic top-level sections before switching engines.
    for (let index = 0; index < 3; index += 1) {
      const sectionId = await createTopLevelSection({
        page,
        projectConfigId: projectContext.projectConfigId,
        implType: "Callable",
        viewportBounds,
        position: {
          x: viewportBounds.x + 100 + index * 320,
          y: viewportBounds.y + 140,
        },
      });
      createdTopLevelSectionIds.push(sectionId);
    }

    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);

    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(3);

    const activeBackend = await host.getAttribute(
      "data-canvas-engine-active-backend",
    );
    expect(activeBackend === "webgpu" || activeBackend === "webgl2").toBe(true);

    const rectCountBeforeCreate = await readRectCount(host);
    const engineViewportBounds = await getEngineViewportBounds(page);
    const createdTextBlockSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "TextBlock",
      viewportBounds: engineViewportBounds,
      position: {
        x: engineViewportBounds.x + 220,
        y: engineViewportBounds.y + 420,
      },
    });
    createdTopLevelSectionIds.push(createdTextBlockSectionId);

    // Ensure section-state updates continue to flow into the new host.
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThan(rectCountBeforeCreate);

    if (createdTopLevelSectionIds.length < 2) {
      throw new Error("Expected at least two top-level sections.");
    }
    const createdChatSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Chat",
      viewportBounds: engineViewportBounds,
      position: {
        x: engineViewportBounds.x + 520,
        y: engineViewportBounds.y + 420,
      },
    });
    createdTopLevelSectionIds.push(createdChatSectionId);
    await createAgenticEdge({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId: createdTopLevelSectionIds[0],
      targetSectionId: createdChatSectionId,
      kind: "section_chat",
    });

    await expect
      .poll(async () => await readAgenticEdgeCount(host))
      .toBeGreaterThanOrEqual(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host supports section click selection and pane click clear", async ({
  page,
}) => {
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
    const camera = await readCamera(host);
    const firstScreenPoint = {
      x: hostBounds.x + hostBounds.width * 0.38,
      y: hostBounds.y + hostBounds.height * 0.42,
    };
    const secondScreenPoint = {
      x: hostBounds.x + hostBounds.width * 0.56,
      y: hostBounds.y + hostBounds.height * 0.42,
    };
    const firstPosition = screenToWorldPoint(
      firstScreenPoint,
      hostBounds,
      camera,
    );
    const secondPosition = screenToWorldPoint(
      secondScreenPoint,
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const firstSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: firstPosition,
    });
    const secondSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: secondPosition,
    });
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(2);

    await clickWorldPoint(page, host, {
      x: firstPosition.x + 40,
      y: firstPosition.y + 40,
    });
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await clickWorldPoint(page, host, {
      x: secondPosition.x + 40,
      y: secondPosition.y + 40,
    });
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([secondSectionId]);

    await clearSelectionByPaneClick(page, host);
    await expect.poll(async () => await readActiveSectionIds(host)).toEqual([]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host drags sections and persists top-level layout", async ({
  page,
}) => {
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
    const camera = await readCamera(host);
    const sectionScreenPoint = {
      x: hostBounds.x + hostBounds.width * 0.48,
      y: hostBounds.y + hostBounds.height * 0.5,
    };
    const sectionPosition = screenToWorldPoint(
      sectionScreenPoint,
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const sectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: sectionPosition,
    });

    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(1);

    const initialPosition = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const dragDelta = { x: 120, y: 80 };
    await dragWorldPoint(page, host, {
      start: {
        x: initialPosition.x + 50,
        y: initialPosition.y + 50,
      },
      end: {
        x: initialPosition.x + 50 + dragDelta.x,
        y: initialPosition.y + 50 + dragDelta.y,
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

async function createTopLevelSection({
  page,
  projectConfigId,
  implType,
  viewportBounds,
  position,
}: {
  page: Page;
  projectConfigId: string;
  implType: string;
  viewportBounds: FlowViewportBounds;
  position: { x: number; y: number };
}): Promise<string> {
  const response = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      viewportBounds,
      position,
    },
  );
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId for implType ${implType}.`);
  }
  return response.sectionId;
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
  const value = await host.getAttribute("data-canvas-engine-rect-count");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid rect count attribute: ${String(value)}`);
  }
  return parsed;
}

async function readAgenticEdgeCount(host: Locator): Promise<number> {
  const value = await host.getAttribute(
    "data-canvas-engine-agentic-edge-count",
  );
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid agentic edge count attribute: ${String(value)}`);
  }
  return parsed;
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

async function clickWorldPoint(
  page: Page,
  host: Locator,
  worldPoint: WorldPoint,
): Promise<void> {
  const { x: screenX, y: screenY } = await worldPointToScreen(host, worldPoint);
  await page.mouse.click(screenX, screenY);
}

function screenToWorldPoint(
  screenPoint: { x: number; y: number },
  hostBounds: { x: number; y: number; width: number; height: number },
  camera: CanvasEngineCameraSnapshot,
): WorldPoint {
  const localX = screenPoint.x - hostBounds.x;
  const localY = screenPoint.y - hostBounds.y;
  return {
    x: camera.x + localX / camera.zoom,
    y: camera.y + localY / camera.zoom,
  };
}

async function clearSelectionByPaneClick(
  page: Page,
  host: Locator,
): Promise<void> {
  const bounds = await host.boundingBox();
  if (!bounds) {
    throw new Error("Unable to resolve canvas host bounds for pane click.");
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
      await page.mouse.click(bounds.x + xOffset, bounds.y + yOffset);
      const activeIds = await readActiveSectionIds(host);
      if (activeIds.length === 0) {
        return;
      }
    }
  }

  throw new Error("Unable to clear active section ids via pane click targets.");
}

async function worldPointToScreen(
  host: Locator,
  worldPoint: WorldPoint,
): Promise<{ x: number; y: number }> {
  const bounds = await host.boundingBox();
  if (!bounds) {
    throw new Error("Unable to resolve canvas host bounds.");
  }
  const camera = await readCamera(host);
  const screenX = bounds.x + (worldPoint.x - camera.x) * camera.zoom;
  const screenY = bounds.y + (worldPoint.y - camera.y) * camera.zoom;
  if (
    screenX < bounds.x ||
    screenX > bounds.x + bounds.width ||
    screenY < bounds.y ||
    screenY > bounds.y + bounds.height
  ) {
    throw new Error(
      `World point ${JSON.stringify(worldPoint)} resolved outside canvas bounds.`,
    );
  }
  return { x: screenX, y: screenY };
}

async function dragWorldPoint(
  page: Page,
  host: Locator,
  points: {
    start: WorldPoint;
    end: WorldPoint;
  },
): Promise<void> {
  const start = await worldPointToScreen(host, points.start);
  const end = await worldPointToScreen(host, points.end);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
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
    response?.projectState?.projectConfig?.topLevelSections?.[sectionId] ??
    null;
  if (!layout) {
    throw new Error(`Missing top-level layout for section ${sectionId}.`);
  }
  if (typeof layout.x !== "number" || typeof layout.y !== "number") {
    throw new Error(
      `Invalid top-level layout position for section ${sectionId}: ${JSON.stringify(layout)}`,
    );
  }
  return { x: layout.x, y: layout.y };
}

async function createAgenticEdge({
  page,
  projectConfigId,
  sourceSectionId,
  targetSectionId,
  kind,
}: {
  page: Page;
  projectConfigId: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKind;
}): Promise<void> {
  await postBackend(page, "/createAgenticEdge", {
    projectConfigId,
    id: null,
    sourceSectionId,
    targetSectionId,
    kind,
    contextMode: "reference_only",
    style: null,
    hidden: false,
    zIndex: 0,
  });
}
