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
  w?: number | null;
  h?: number | null;
  zIndex?: number;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      topLevelSections?: Record<string, TopLevelSectionLayoutSnapshot>;
      viewport?: {
        x?: number;
        y?: number;
        zoom?: number;
      } | null;
      sectionVariantMap?: Record<string, string>;
      edges?: Array<{
        id?: string;
        selected?: boolean;
        sourceSectionId?: string;
        sourcePortId?: string;
        targetSectionId?: string;
        targetPortId?: string;
      }>;
      agenticEdges?: Array<{
        id?: string;
        selected?: boolean;
        sourceSectionId?: string;
        targetSectionId?: string;
        kind?: AgenticEdgeKind;
      }>;
    };
    sectionVariants?: Record<string, { impl?: string }>;
    sectionImpls?: Record<
      string,
      {
        codeObjVariantMap?: Record<string, string>;
        edgeInputParams?: string[];
      }
    >;
    codeObjVariants?: Record<string, { impl?: string }>;
    codeObjImpls?: Record<string, { type?: string }>;
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

type CanvasEngineConnectionPreviewState = {
  active: boolean;
  kind: string;
  valid: boolean;
  hasTargetHandle: boolean;
};

type CanvasEngineHoveredEdgeState = {
  active: boolean;
  kind: string;
  id: string;
};

type CanvasEngineSelectionRectState = {
  active: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
};

type CanvasEngineEdgeHandleSeed = {
  sectionId: string;
  portId: string;
  type: "source" | "target";
  side: "left" | "right" | "top" | "bottom";
  x: number;
  y: number;
};

const DEFAULT_SECTION_WIDTH_FOR_HIT_TEST = 320;
const DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST = 200;
const SECTION_BODY_CLICK_OFFSET_X = 140;
const SECTION_BODY_CLICK_OFFSET_Y = 110;
const DOM_ISLAND_RETENTION_TEST_WAIT_MS = 900;
const DOM_ISLAND_RETENTION_CAP_STRESS_SECTION_COUNT = 120;
const AGENTIC_HANDLE_CENTER_OFFSET_WORLD = 19;
const MULTI_SELECTION_MODIFIER_KEY =
  process.platform === "darwin" ? "Meta" : "Control";
const SECTION_PARAM_CODE_OBJ_TYPES = new Set<string>([
  "CodeParam",
  "TextParam",
  "DateParam",
  "TimeParam",
  "TextAreaParam",
  "SliderParam",
  "RotaryParam",
  "SwitchParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "DropzoneParam",
  "NestedParam",
]);

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
    await expect
      .poll(async () => await readDomIslandCount(host))
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

test("canvas engine host persists camera viewport after pan and zoom", async ({
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
    const cameraBefore = await readCamera(host);

    const panStart = {
      x: hostBounds.x + hostBounds.width * 0.7,
      y: hostBounds.y + hostBounds.height * 0.5,
    };
    const panEnd = {
      x: panStart.x - 180,
      y: panStart.y + 120,
    };
    await page.mouse.move(panStart.x, panStart.y);
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

    await page.mouse.move(
      hostBounds.x + hostBounds.width * 0.5,
      hostBounds.y + hostBounds.height * 0.5,
    );
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
        { timeout: 15000 },
      )
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host mounts pointer-enabled dom-island controls", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();
    await expect(page.locator(".react-flow__pane")).toHaveCount(0);
    await expect
      .poll(async () => await readDomIslandCount(host))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const controls = document.querySelectorAll(
            [
              "[data-canvas-engine-dom-island] button",
              "[data-canvas-engine-dom-island] input",
              "[data-canvas-engine-dom-island] textarea",
              "[data-canvas-engine-dom-island] select",
            ].join(","),
          );
          for (const control of controls) {
            const style = window.getComputedStyle(control);
            if (style.pointerEvents !== "none") {
              return true;
            }
          }
          return false;
        });
      })
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host mounts dom islands for newly visible sections", async ({
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
    const createdSectionPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.58,
        y: hostBounds.y + hostBounds.height * 0.5,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const createdSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: createdSectionPosition,
    });

    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(
        async () =>
          await page
            .locator(`[data-canvas-engine-dom-island="${createdSectionId}"]`)
            .count(),
      )
      .toBe(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host briefly retains offscreen dom islands", async ({
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
    const createdSectionPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.52,
        y: hostBounds.y + hostBounds.height * 0.52,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const createdSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: createdSectionPosition,
    });
    const createdSectionIsland = host.locator(
      `[data-canvas-engine-dom-island="${createdSectionId}"]`,
    );
    await expect(createdSectionIsland).toHaveCount(1);

    await clearSelectionByPaneClick(page, host);
    await expect.poll(async () => await readActiveSectionIds(host)).toEqual([]);

    const cameraBeforePan = await readCamera(host);
    const createdSectionLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      createdSectionId,
    );
    const targetCameraX =
      createdSectionLayout.x + DEFAULT_SECTION_WIDTH_FOR_HIT_TEST + 140;
    const requiredCameraDeltaX = Math.max(0, targetCameraX - cameraBeforePan.x);
    if (requiredCameraDeltaX > 0) {
      await panCanvasHostByPixelDelta(page, host, {
        x: -Math.ceil(requiredCameraDeltaX * cameraBeforePan.zoom + 220),
        y: 0,
      });
    }

    await expect(createdSectionIsland).toHaveCount(1);
    await expect
      .poll(async () => await readRetainedDomIslandCount(host))
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => await readDomIslandDisplayState(createdSectionIsland))
      .toBe("none");

    await page.waitForTimeout(DOM_ISLAND_RETENTION_TEST_WAIT_MS);
    await expect(createdSectionIsland).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host caps retained dom islands after large offscreen transition", async ({
  page,
}) => {
  test.setTimeout(120000);
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
    const basePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.52,
        y: hostBounds.y + hostBounds.height * 0.5,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);
    const columns = 12;
    const xGap = 18;
    const yGap = 14;

    for (
      let index = 0;
      index < DOM_ISLAND_RETENTION_CAP_STRESS_SECTION_COUNT;
      index += 1
    ) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      await createTopLevelSection({
        page,
        projectConfigId: projectContext.projectConfigId,
        implType: "Callable",
        viewportBounds: engineViewportBounds,
        position: {
          x: basePosition.x + column * xGap,
          y: basePosition.y + row * yGap,
        },
      });
    }

    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(DOM_ISLAND_RETENTION_CAP_STRESS_SECTION_COUNT);
    await expect
      .poll(async () => await readDomIslandCount(host))
      .toBeGreaterThanOrEqual(DOM_ISLAND_RETENTION_CAP_STRESS_SECTION_COUNT);

    const retentionCap = await readDomIslandRetentionCap(host);
    expect(retentionCap).toBeGreaterThanOrEqual(1);

    await clearSelectionByPaneClick(page, host);
    await expect.poll(async () => await readActiveSectionIds(host)).toEqual([]);

    const cameraBeforePan = await readCamera(host);
    const targetCameraX =
      basePosition.x +
      DEFAULT_SECTION_WIDTH_FOR_HIT_TEST +
      columns * xGap +
      160;
    const requiredCameraDeltaX = Math.max(0, targetCameraX - cameraBeforePan.x);
    if (requiredCameraDeltaX > 0) {
      await panCanvasHostByPixelDelta(page, host, {
        x: -Math.ceil(requiredCameraDeltaX * cameraBeforePan.zoom + 260),
        y: 0,
      });
    }

    await expect
      .poll(async () => await readDomIslandRetainedCount(host))
      .toBeLessThanOrEqual(retentionCap);
    await expect
      .poll(async () => await readRetainedDomIslandCount(host))
      .toBeLessThanOrEqual(retentionCap);
    await expect
      .poll(async () => await readDomIslandMountedCount(host))
      .toBeLessThanOrEqual(retentionCap);

    const retentionMs = await readDomIslandRetentionMs(host);
    await page.waitForTimeout(retentionMs + DOM_ISLAND_RETENTION_TEST_WAIT_MS);

    await expect
      .poll(async () => await readDomIslandRetainedCount(host))
      .toBe(0);
    await expect
      .poll(async () => await readRetainedDomIslandCount(host))
      .toBe(0);
    await expect.poll(async () => await readDomIslandCount(host)).toBe(0);
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
      x: hostBounds.x + hostBounds.width * 0.74,
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
    const firstSectionPosition = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    const secondSectionPosition = await readTopLevelSectionPosition(
      page,
      projectContext.projectConfigId,
      secondSectionId,
    );

    await clickWorldPoint(page, host, {
      x: firstSectionPosition.x + SECTION_BODY_CLICK_OFFSET_X,
      y: firstSectionPosition.y + SECTION_BODY_CLICK_OFFSET_Y,
    });
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await clickWorldPoint(page, host, {
      x: secondSectionPosition.x + SECTION_BODY_CLICK_OFFSET_X,
      y: secondSectionPosition.y + SECTION_BODY_CLICK_OFFSET_Y,
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

test("canvas engine host ignores section-control clicks for canvas selection", async ({
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
    const firstPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.38,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const secondPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.74,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
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

    const firstLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    await clickWorldPoint(page, host, {
      x: firstLayout.x + SECTION_BODY_CLICK_OFFSET_X,
      y: firstLayout.y + SECTION_BODY_CLICK_OFFSET_Y,
    });
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    const secondSectionMenuItems = page.locator(
      `[data-canvas-engine-dom-island="${secondSectionId}"] [role="menuitem"]`,
    );
    await expect
      .poll(async () => await secondSectionMenuItems.count())
      .toBeGreaterThan(0);
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
    const firstPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.38,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const secondPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.74,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
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

    const firstLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    const secondLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      secondSectionId,
    );

    await clickWorldPoint(page, host, {
      x: firstLayout.x + SECTION_BODY_CLICK_OFFSET_X,
      y: firstLayout.y + SECTION_BODY_CLICK_OFFSET_Y,
    });
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await page.keyboard.down(MULTI_SELECTION_MODIFIER_KEY);
    try {
      await clickWorldPoint(page, host, {
        x: secondLayout.x + SECTION_BODY_CLICK_OFFSET_X,
        y: secondLayout.y + SECTION_BODY_CLICK_OFFSET_Y,
      });
      await expect
        .poll(async () => await readActiveSectionIds(host))
        .toEqual([firstSectionId, secondSectionId]);

      await clickWorldPoint(page, host, {
        x: firstLayout.x + SECTION_BODY_CLICK_OFFSET_X,
        y: firstLayout.y + SECTION_BODY_CLICK_OFFSET_Y,
      });
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

test("canvas engine host drags selected section groups together", async ({
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
    const firstPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.36,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const secondPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.68,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
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

    const firstLayoutBefore = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    const secondLayoutBefore = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      secondSectionId,
    );

    await clickWorldPoint(page, host, {
      x: firstLayoutBefore.x + SECTION_BODY_CLICK_OFFSET_X,
      y: firstLayoutBefore.y + SECTION_BODY_CLICK_OFFSET_Y,
    });
    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([firstSectionId]);

    await page.keyboard.down(MULTI_SELECTION_MODIFIER_KEY);
    try {
      await clickWorldPoint(page, host, {
        x: secondLayoutBefore.x + SECTION_BODY_CLICK_OFFSET_X,
        y: secondLayoutBefore.y + SECTION_BODY_CLICK_OFFSET_Y,
      });
    } finally {
      await page.keyboard.up(MULTI_SELECTION_MODIFIER_KEY);
    }
    await expect
      .poll(async () => [...(await readActiveSectionIds(host))].sort())
      .toEqual([firstSectionId, secondSectionId].sort());

    const dragDelta = { x: 140, y: 90 };
    await dragWorldPoint(page, host, {
      start: {
        x: firstLayoutBefore.x + 70,
        y: firstLayoutBefore.y + 60,
      },
      end: {
        x: firstLayoutBefore.x + 70 + dragDelta.x,
        y: firstLayoutBefore.y + 60 + dragDelta.y,
      },
    });

    await expect
      .poll(async () => {
        const firstLayoutAfter = await readTopLevelSectionLayout(
          page,
          projectContext.projectConfigId,
          firstSectionId,
        );
        return (
          Math.abs(firstLayoutAfter.x - (firstLayoutBefore.x + dragDelta.x)) <=
            0.5 &&
          Math.abs(firstLayoutAfter.y - (firstLayoutBefore.y + dragDelta.y)) <=
            0.5
        );
      })
      .toBe(true);

    const firstLayoutAfter = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    const secondLayoutAfter = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      secondSectionId,
    );

    const firstDeltaX = firstLayoutAfter.x - firstLayoutBefore.x;
    const firstDeltaY = firstLayoutAfter.y - firstLayoutBefore.y;
    const secondDeltaX = secondLayoutAfter.x - secondLayoutBefore.x;
    const secondDeltaY = secondLayoutAfter.y - secondLayoutBefore.y;

    expect(Math.abs(firstDeltaX - dragDelta.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(firstDeltaY - dragDelta.y)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(secondDeltaX - dragDelta.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(secondDeltaY - dragDelta.y)).toBeLessThanOrEqual(0.5);

    await expect
      .poll(async () => [...(await readActiveSectionIds(host))].sort())
      .toEqual([firstSectionId, secondSectionId].sort());
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host supports shift-drag marquee section selection", async ({
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
    const firstPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.36,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const secondPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.68,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
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

    const firstLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      firstSectionId,
    );
    const secondLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      secondSectionId,
    );
    const firstSectionWidth =
      firstLayout.w ?? DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const firstSectionHeight =
      firstLayout.h ?? DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const secondSectionWidth =
      secondLayout.w ?? DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const secondSectionHeight =
      secondLayout.h ?? DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const selectionStartWorld = {
      x: firstLayout.x - 24,
      y: firstLayout.y - 24,
    };
    const selectionEndWorld = {
      x: secondLayout.x + secondSectionWidth + 24,
      y:
        Math.max(
          firstLayout.y + firstSectionHeight,
          secondLayout.y + secondSectionHeight,
        ) + 24,
    };
    const selectionStartScreen = await worldPointToScreen(
      host,
      selectionStartWorld,
    );
    const selectionEndScreen = await worldPointToScreen(
      host,
      selectionEndWorld,
    );

    await page.keyboard.down("Shift");
    try {
      await page.mouse.move(selectionStartScreen.x, selectionStartScreen.y);
      await page.mouse.down();
      await page.mouse.move(selectionEndScreen.x, selectionEndScreen.y, {
        steps: 12,
      });

      await expect
        .poll(async () => await readSelectionRectState(host))
        .toMatchObject({ active: true });
      await expect
        .poll(async () => (await readSelectionRectState(host)).width)
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await readSelectionRectState(host)).height)
        .toBeGreaterThan(0);
      await expect
        .poll(
          async () => [...(await readActiveSectionIds(host))].sort(),
          // Keep polling short while the drag session is active.
          { timeout: 5000 },
        )
        .toEqual([firstSectionId, secondSectionId].sort());
      await page.mouse.up();
    } finally {
      await page.keyboard.up("Shift");
    }

    await expect
      .poll(async () => (await readSelectionRectState(host)).active)
      .toBe(false);
    await expect
      .poll(async () => [...(await readActiveSectionIds(host))].sort())
      .toEqual([firstSectionId, secondSectionId].sort());
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

test("canvas engine host resizes sections and persists top-level size", async ({
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
      x: hostBounds.x + hostBounds.width * 0.44,
      y: hostBounds.y + hostBounds.height * 0.52,
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

    const initialLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const initialWidth =
      typeof initialLayout.w === "number"
        ? initialLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const initialHeight =
      typeof initialLayout.h === "number"
        ? initialLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const resizeStart = {
      x: initialLayout.x + initialWidth - 2,
      y: initialLayout.y + initialHeight - 2,
    };
    const resizeDelta = { x: 120, y: 90 };
    await dragWorldPoint(page, host, {
      start: resizeStart,
      end: {
        x: resizeStart.x + resizeDelta.x,
        y: resizeStart.y + resizeDelta.y,
      },
    });

    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toEqual([sectionId]);
    await expect
      .poll(
        async () =>
          (
            await readTopLevelSectionLayout(
              page,
              projectContext.projectConfigId,
              sectionId,
            )
          ).w ?? 0,
      )
      .toBeGreaterThan(initialWidth);
    await expect
      .poll(
        async () =>
          (
            await readTopLevelSectionLayout(
              page,
              projectContext.projectConfigId,
              sectionId,
            )
          ).h ?? 0,
      )
      .toBeGreaterThan(initialHeight);

    const finalLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    expect(finalLayout.x).toBe(initialLayout.x);
    expect(finalLayout.y).toBe(initialLayout.y);
    expect(finalLayout.w).toBeGreaterThan(initialWidth);
    expect(finalLayout.h).toBeGreaterThan(initialHeight);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host creates data edges via handle drag", async ({
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
    const sourcePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.34,
        y: hostBounds.y + hostBounds.height * 0.4,
      },
      hostBounds,
      camera,
    );
    const targetPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.72,
        y: hostBounds.y + hostBounds.height * 0.4,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(2);

    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
      "sorted",
    );
    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      targetSectionId,
      "sorted",
    );

    const [targetPortId] = await readSectionParamIds(
      page,
      projectContext.projectConfigId,
      targetSectionId,
      1,
    );
    const sourcePortId = "canvas-engine-source-port";
    await postBackend(page, "/setSectionEdgeOutputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: sourceSectionId,
      edgeOutputPorts: [{ id: sourcePortId, accessor: "output" }],
    });
    await postBackend(page, "/setSectionEdgeInputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: targetSectionId,
      edgeInputParams: [targetPortId],
    });

    const sourceLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const targetLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      targetSectionId,
    );
    const sourceWidth =
      typeof sourceLayout.w === "number"
        ? sourceLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const sourceHeight =
      typeof sourceLayout.h === "number"
        ? sourceLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const targetHeight =
      typeof targetLayout.h === "number"
        ? targetLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const sourceHandle: WorldPoint = {
      x: sourceLayout.x + sourceWidth,
      y: sourceLayout.y + sourceHeight / 2,
    };
    const targetHandle: WorldPoint = {
      x: targetLayout.x,
      y: targetLayout.y + targetHeight / 2,
    };
    await setCanvasEngineEdgeHandlePositions(page, [
      {
        sectionId: sourceSectionId,
        portId: sourcePortId,
        type: "source",
        side: "right",
        x: sourceHandle.x,
        y: sourceHandle.y,
      },
      {
        sectionId: targetSectionId,
        portId: targetPortId,
        type: "target",
        side: "left",
        x: targetHandle.x,
        y: targetHandle.y,
      },
    ]);
    await expect
      .poll(async () => await readEdgeHandleRegistryPositionCount(page))
      .toBeGreaterThanOrEqual(2);

    const sourceHandleScreen = await worldPointToScreen(host, sourceHandle);
    const targetHandleScreen = await worldPointToScreen(host, targetHandle);
    await page.mouse.move(sourceHandleScreen.x, sourceHandleScreen.y);
    await page.mouse.down();
    await page.mouse.move(targetHandleScreen.x, targetHandleScreen.y, {
      steps: 10,
    });

    await expect
      .poll(async () => await readConnectionPreviewState(host))
      .toEqual({
        active: true,
        kind: "data-connect",
        valid: true,
        hasTargetHandle: true,
      });

    await page.mouse.up();
    await expect
      .poll(async () => (await readConnectionPreviewState(host)).active)
      .toBe(false);

    await expect
      .poll(
        async () =>
          await readDataEdgeLinks(page, projectContext.projectConfigId),
      )
      .toContain(
        `${sourceSectionId}:${sourcePortId}->${targetSectionId}:${targetPortId}`,
      );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host reconnects data edges via endpoint drag", async ({
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
    const sourcePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.28,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const firstTargetPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.54,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const secondTargetPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.78,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: sourcePosition,
    });
    const firstTargetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: firstTargetPosition,
    });
    const secondTargetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: secondTargetPosition,
    });
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(3);

    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
      "sorted",
    );
    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      firstTargetSectionId,
      "sorted",
    );
    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      secondTargetSectionId,
      "sorted",
    );

    const [firstTargetPortId] = await readSectionParamIds(
      page,
      projectContext.projectConfigId,
      firstTargetSectionId,
      1,
    );
    const [secondTargetPortId] = await readSectionParamIds(
      page,
      projectContext.projectConfigId,
      secondTargetSectionId,
      1,
    );
    const sourcePortId = "canvas-engine-reconnect-source-port";
    await postBackend(page, "/setSectionEdgeOutputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: sourceSectionId,
      edgeOutputPorts: [{ id: sourcePortId, accessor: "output" }],
    });
    await postBackend(page, "/setSectionEdgeInputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: firstTargetSectionId,
      edgeInputParams: [firstTargetPortId],
    });
    await postBackend(page, "/setSectionEdgeInputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: secondTargetSectionId,
      edgeInputParams: [secondTargetPortId],
    });

    const sourceVariantId = await readSectionVariantId(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const firstTargetVariantId = await readSectionVariantId(
      page,
      projectContext.projectConfigId,
      firstTargetSectionId,
    );
    await postBackend(page, "/createEdge", {
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      sourceVariantId,
      sourcePortId,
      targetSectionId: firstTargetSectionId,
      targetVariantId: firstTargetVariantId,
      targetPortId: firstTargetPortId,
      type: "default",
    });
    await expect
      .poll(async () => await readDataEdgeCount(host))
      .toBeGreaterThanOrEqual(1);

    const edgeId = await readDataEdgeIdByLink({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      sourcePortId,
      targetSectionId: firstTargetSectionId,
      targetPortId: firstTargetPortId,
    });

    const sourceLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const firstTargetLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      firstTargetSectionId,
    );
    const secondTargetLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      secondTargetSectionId,
    );
    const sourceWidth =
      typeof sourceLayout.w === "number"
        ? sourceLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const sourceHeight =
      typeof sourceLayout.h === "number"
        ? sourceLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const firstTargetHeight =
      typeof firstTargetLayout.h === "number"
        ? firstTargetLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const secondTargetHeight =
      typeof secondTargetLayout.h === "number"
        ? secondTargetLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const sourceHandle: WorldPoint = {
      x: sourceLayout.x + sourceWidth,
      y: sourceLayout.y + sourceHeight / 2,
    };
    const firstTargetHandle: WorldPoint = {
      x: firstTargetLayout.x,
      y: firstTargetLayout.y + firstTargetHeight / 2,
    };
    const secondTargetHandle: WorldPoint = {
      x: secondTargetLayout.x,
      y: secondTargetLayout.y + secondTargetHeight / 2,
    };
    await setCanvasEngineEdgeHandlePositions(page, [
      {
        sectionId: sourceSectionId,
        portId: sourcePortId,
        type: "source",
        side: "right",
        x: sourceHandle.x,
        y: sourceHandle.y,
      },
      {
        sectionId: firstTargetSectionId,
        portId: firstTargetPortId,
        type: "target",
        side: "left",
        x: firstTargetHandle.x,
        y: firstTargetHandle.y,
      },
      {
        sectionId: secondTargetSectionId,
        portId: secondTargetPortId,
        type: "target",
        side: "left",
        x: secondTargetHandle.x,
        y: secondTargetHandle.y,
      },
    ]);
    await expect
      .poll(async () => await readEdgeHandleRegistryPositionCount(page))
      .toBeGreaterThanOrEqual(3);

    const firstTargetHandleScreen = await worldPointToScreen(
      host,
      firstTargetHandle,
    );
    const secondTargetHandleScreen = await worldPointToScreen(
      host,
      secondTargetHandle,
    );
    await page.mouse.move(firstTargetHandleScreen.x, firstTargetHandleScreen.y);
    await page.mouse.down();
    await page.mouse.move(
      secondTargetHandleScreen.x,
      secondTargetHandleScreen.y,
      {
        steps: 10,
      },
    );

    await expect
      .poll(async () => await readConnectionPreviewState(host))
      .toEqual({
        active: true,
        kind: "data-reconnect",
        valid: true,
        hasTargetHandle: true,
      });

    await page.mouse.up();
    await expect
      .poll(async () => (await readConnectionPreviewState(host)).active)
      .toBe(false);

    await expect
      .poll(
        async () =>
          await readDataEdgeById(page, projectContext.projectConfigId, edgeId),
      )
      .toMatchObject({
        id: edgeId,
        sourceSectionId,
        sourcePortId,
        targetSectionId: secondTargetSectionId,
        targetPortId: secondTargetPortId,
      });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host supports data edge hover and click selection", async ({
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
    const sourcePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.34,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const targetPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.72,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(2);

    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
      "sorted",
    );
    await setSectionCallable(
      page,
      projectContext.projectConfigId,
      targetSectionId,
      "sorted",
    );

    const [targetPortId] = await readSectionParamIds(
      page,
      projectContext.projectConfigId,
      targetSectionId,
      1,
    );
    const sourcePortId = "canvas-engine-hover-source-port";
    await postBackend(page, "/setSectionEdgeOutputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: sourceSectionId,
      edgeOutputPorts: [{ id: sourcePortId, accessor: "output" }],
    });
    await postBackend(page, "/setSectionEdgeInputs", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: targetSectionId,
      edgeInputParams: [targetPortId],
    });

    const sourceVariantId = await readSectionVariantId(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const targetVariantId = await readSectionVariantId(
      page,
      projectContext.projectConfigId,
      targetSectionId,
    );
    await postBackend(page, "/createEdge", {
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      sourceVariantId,
      sourcePortId,
      targetSectionId,
      targetVariantId,
      targetPortId,
      type: "default",
    });
    await expect
      .poll(async () => await readDataEdgeCount(host))
      .toBeGreaterThanOrEqual(1);

    const edgeId = await readDataEdgeIdByLink({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      sourcePortId,
      targetSectionId,
      targetPortId,
    });

    const sourceLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const targetLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      targetSectionId,
    );
    const sourceWidth =
      typeof sourceLayout.w === "number"
        ? sourceLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const sourceHeight =
      typeof sourceLayout.h === "number"
        ? sourceLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const targetHeight =
      typeof targetLayout.h === "number"
        ? targetLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const sourceHandle: WorldPoint = {
      x: sourceLayout.x + sourceWidth,
      y: sourceLayout.y + sourceHeight / 2,
    };
    const targetHandle: WorldPoint = {
      x: targetLayout.x,
      y: targetLayout.y + targetHeight / 2,
    };
    await setCanvasEngineEdgeHandlePositions(page, [
      {
        sectionId: sourceSectionId,
        portId: sourcePortId,
        type: "source",
        side: "right",
        x: sourceHandle.x,
        y: sourceHandle.y,
      },
      {
        sectionId: targetSectionId,
        portId: targetPortId,
        type: "target",
        side: "left",
        x: targetHandle.x,
        y: targetHandle.y,
      },
    ]);
    await expect
      .poll(async () => await readEdgeHandleRegistryPositionCount(page))
      .toBeGreaterThanOrEqual(2);

    const edgeMidpoint: WorldPoint = {
      x: (sourceHandle.x + targetHandle.x) / 2,
      y: (sourceHandle.y + targetHandle.y) / 2,
    };
    const edgeMidpointScreen = await worldPointToScreen(host, edgeMidpoint);
    await page.mouse.move(edgeMidpointScreen.x, edgeMidpointScreen.y);

    await expect
      .poll(async () => await readHoveredEdgeState(host))
      .toEqual({
        active: true,
        kind: "data",
        id: edgeId,
      });

    await page.mouse.click(edgeMidpointScreen.x, edgeMidpointScreen.y);
    await expect
      .poll(
        async () =>
          await readSelectedDataEdgeIds(page, projectContext.projectConfigId),
      )
      .toEqual([edgeId]);

    await page.mouse.move(edgeMidpointScreen.x, edgeMidpointScreen.y + 180);
    await expect
      .poll(async () => (await readHoveredEdgeState(host)).active)
      .toBe(false);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host creates agentic edges via handle drag", async ({
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
    const sourcePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.34,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const targetPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.72,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Chat",
      viewportBounds: engineViewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(2);

    const sourceLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const targetLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      targetSectionId,
    );
    const sourceWidth =
      typeof sourceLayout.w === "number"
        ? sourceLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const sourceHeight =
      typeof sourceLayout.h === "number"
        ? sourceLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const targetWidth =
      typeof targetLayout.w === "number"
        ? targetLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const targetHeight =
      typeof targetLayout.h === "number"
        ? targetLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const sourceHandle = resolveAgenticHandleWorldPoint({
      layout: sourceLayout,
      width: sourceWidth,
      height: sourceHeight,
      side: "source",
    });
    const targetHandle = resolveAgenticHandleWorldPoint({
      layout: targetLayout,
      width: targetWidth,
      height: targetHeight,
      side: "target",
    });

    const sourceHandleScreen = await worldPointToScreen(host, sourceHandle);
    const targetHandleScreen = await worldPointToScreen(host, targetHandle);
    await page.mouse.move(sourceHandleScreen.x, sourceHandleScreen.y);
    await page.mouse.down();
    await page.mouse.move(targetHandleScreen.x, targetHandleScreen.y, {
      steps: 10,
    });

    await expect
      .poll(async () => await readConnectionPreviewState(host))
      .toEqual({
        active: true,
        kind: "agentic-connect",
        valid: true,
        hasTargetHandle: true,
      });

    await page.mouse.up();
    await expect
      .poll(async () => (await readConnectionPreviewState(host)).active)
      .toBe(false);

    await expect
      .poll(async () => await readAgenticEdgeCount(host))
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () =>
          await readAgenticEdgeLinks(page, projectContext.projectConfigId),
      )
      .toContain(`${sourceSectionId}->${targetSectionId}:section_chat`);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host supports agentic edge click selection", async ({
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
    const sourcePosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.34,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const targetPosition = screenToWorldPoint(
      {
        x: hostBounds.x + hostBounds.width * 0.72,
        y: hostBounds.y + hostBounds.height * 0.42,
      },
      hostBounds,
      camera,
    );
    const engineViewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: engineViewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Chat",
      viewportBounds: engineViewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(async () => await readRectCount(host))
      .toBeGreaterThanOrEqual(2);

    const edgeId = "canvas-engine-host-agentic-edge";
    await createAgenticEdge({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      targetSectionId,
      kind: "section_chat",
      edgeId,
    });
    await expect
      .poll(async () => await readAgenticEdgeCount(host))
      .toBeGreaterThanOrEqual(1);

    const sourceLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      sourceSectionId,
    );
    const targetLayout = await readTopLevelSectionLayout(
      page,
      projectContext.projectConfigId,
      targetSectionId,
    );
    const sourceWidth =
      typeof sourceLayout.w === "number"
        ? sourceLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const sourceHeight =
      typeof sourceLayout.h === "number"
        ? sourceLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;
    const targetWidth =
      typeof targetLayout.w === "number"
        ? targetLayout.w
        : DEFAULT_SECTION_WIDTH_FOR_HIT_TEST;
    const targetHeight =
      typeof targetLayout.h === "number"
        ? targetLayout.h
        : DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST;

    const sourceCenterX = sourceLayout.x + sourceWidth / 2;
    const targetCenterX = targetLayout.x + targetWidth / 2;
    const targetOnRight = targetCenterX >= sourceCenterX;
    const edgeStart = {
      x: targetOnRight ? sourceLayout.x + sourceWidth : sourceLayout.x,
      y: sourceLayout.y + sourceHeight / 2,
    };
    const edgeEnd = {
      x: targetOnRight ? targetLayout.x : targetLayout.x + targetWidth,
      y: targetLayout.y + targetHeight / 2,
    };
    const edgeMidpoint = {
      x: (edgeStart.x + edgeEnd.x) / 2,
      y: (edgeStart.y + edgeEnd.y) / 2,
    };
    const edgeMidpointScreen = await worldPointToScreen(host, edgeMidpoint);
    await page.mouse.move(edgeMidpointScreen.x, edgeMidpointScreen.y);

    await expect
      .poll(async () => await readHoveredEdgeState(host))
      .toEqual({
        active: true,
        kind: "agentic",
        id: edgeId,
      });

    await clickWorldPoint(page, host, {
      x: edgeMidpoint.x,
      y: edgeMidpoint.y,
    });

    await expect
      .poll(
        async () =>
          await readSelectedAgenticEdgeIds(
            page,
            projectContext.projectConfigId,
          ),
      )
      .toEqual([edgeId]);
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

async function setSectionCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
): Promise<void> {
  await postBackend(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams: true,
  });
}

async function readSectionParamIds(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  minCount: number,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const variantId =
    response?.projectState?.projectConfig?.sectionVariantMap?.[sectionId] ??
    null;
  if (!variantId) {
    throw new Error(`Missing variant id for section ${sectionId}.`);
  }
  const implId =
    response?.projectState?.sectionVariants?.[variantId]?.impl ?? null;
  if (!implId) {
    throw new Error(`Missing impl id for section variant ${variantId}.`);
  }
  const impl = response?.projectState?.sectionImpls?.[implId] ?? null;
  if (!impl) {
    throw new Error(`Missing section impl ${implId}.`);
  }
  const codeObjVariantMap = impl.codeObjVariantMap ?? {};
  const codeObjVariants = response?.projectState?.codeObjVariants ?? {};
  const codeObjImpls = response?.projectState?.codeObjImpls ?? {};
  const ids = Object.entries(codeObjVariantMap)
    .filter((entry) => {
      const codeObjVariantId = entry[1];
      const codeObjImplId = codeObjVariants[codeObjVariantId]?.impl;
      if (!codeObjImplId) {
        return false;
      }
      const codeObjType = codeObjImpls[codeObjImplId]?.type;
      return (
        typeof codeObjType === "string" &&
        SECTION_PARAM_CODE_OBJ_TYPES.has(codeObjType)
      );
    })
    .map((entry) => entry[0]);
  if (ids.length < minCount) {
    throw new Error(
      `Expected at least ${minCount} section param ids in section ${sectionId}. Found ${ids.length}.`,
    );
  }
  return ids;
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

async function readDomIslandCount(host: Locator): Promise<number> {
  return await host.locator("[data-canvas-engine-dom-island]").count();
}

async function readRetainedDomIslandCount(host: Locator): Promise<number> {
  return await host
    .locator('[data-canvas-engine-dom-island-retained="true"]')
    .count();
}

async function readDomIslandDisplayState(domIsland: Locator): Promise<string> {
  return await domIsland.evaluate((element) => {
    return window.getComputedStyle(element).display;
  });
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

async function readDataEdgeCount(host: Locator): Promise<number> {
  const value = await host.getAttribute("data-canvas-engine-data-edge-count");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid data edge count attribute: ${String(value)}`);
  }
  return parsed;
}

async function readConnectionPreviewState(
  host: Locator,
): Promise<CanvasEngineConnectionPreviewState> {
  const activeRaw = await host.getAttribute(
    "data-canvas-engine-connection-preview-active",
  );
  const kind =
    (await host.getAttribute("data-canvas-engine-connection-preview-kind")) ??
    "";
  const validRaw = await host.getAttribute(
    "data-canvas-engine-connection-preview-valid",
  );
  const hasTargetHandleRaw = await host.getAttribute(
    "data-canvas-engine-connection-preview-has-target-handle",
  );
  return {
    active: parseBooleanHostAttribute(
      "data-canvas-engine-connection-preview-active",
      activeRaw,
    ),
    kind,
    valid: parseBooleanHostAttribute(
      "data-canvas-engine-connection-preview-valid",
      validRaw,
    ),
    hasTargetHandle: parseBooleanHostAttribute(
      "data-canvas-engine-connection-preview-has-target-handle",
      hasTargetHandleRaw,
    ),
  };
}

async function readHoveredEdgeState(
  host: Locator,
): Promise<CanvasEngineHoveredEdgeState> {
  const activeRaw = await host.getAttribute(
    "data-canvas-engine-hovered-edge-active",
  );
  const kind =
    (await host.getAttribute("data-canvas-engine-hovered-edge-kind")) ?? "";
  const id =
    (await host.getAttribute("data-canvas-engine-hovered-edge-id")) ?? "";
  return {
    active: parseBooleanHostAttribute(
      "data-canvas-engine-hovered-edge-active",
      activeRaw,
    ),
    kind,
    id,
  };
}

async function readSelectionRectState(
  host: Locator,
): Promise<CanvasEngineSelectionRectState> {
  const activeRaw = await host.getAttribute(
    "data-canvas-engine-selection-rect-active",
  );
  const xRaw = await host.getAttribute("data-canvas-engine-selection-rect-x");
  const yRaw = await host.getAttribute("data-canvas-engine-selection-rect-y");
  const widthRaw = await host.getAttribute(
    "data-canvas-engine-selection-rect-width",
  );
  const heightRaw = await host.getAttribute(
    "data-canvas-engine-selection-rect-height",
  );
  return {
    active: parseBooleanHostAttribute(
      "data-canvas-engine-selection-rect-active",
      activeRaw,
    ),
    x: parseNumericHostAttribute("data-canvas-engine-selection-rect-x", xRaw),
    y: parseNumericHostAttribute("data-canvas-engine-selection-rect-y", yRaw),
    width: parseNumericHostAttribute(
      "data-canvas-engine-selection-rect-width",
      widthRaw,
    ),
    height: parseNumericHostAttribute(
      "data-canvas-engine-selection-rect-height",
      heightRaw,
    ),
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

function parseBooleanHostAttribute(
  attributeName: string,
  value: string | null,
): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(
    `Invalid boolean host attribute ${attributeName}: ${String(value)}`,
  );
}

function parseNumericHostAttribute(
  attributeName: string,
  value: string | null,
): number | null {
  if (value === null || value.length === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid numeric host attribute ${attributeName}: ${String(value)}`,
    );
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

async function panCanvasHostByPixelDelta(
  page: Page,
  host: Locator,
  delta: { x: number; y: number },
): Promise<void> {
  const startPoint = await resolvePaneScreenPoint(page, host);
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(startPoint.x + delta.x, startPoint.y + delta.y, {
    steps: 10,
  });
  await page.mouse.up();
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
  const layout = await readTopLevelSectionLayout(
    page,
    projectConfigId,
    sectionId,
  );
  return { x: layout.x, y: layout.y };
}

async function readTopLevelSectionLayout(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{
  x: number;
  y: number;
  w: number | null;
  h: number | null;
}> {
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
  return {
    x: layout.x,
    y: layout.y,
    w: typeof layout.w === "number" ? layout.w : null,
    h: typeof layout.h === "number" ? layout.h : null,
  };
}

async function setCanvasEngineEdgeHandlePositions(
  page: Page,
  handles: CanvasEngineEdgeHandleSeed[],
): Promise<void> {
  await page.evaluate(async (nextHandles) => {
    const { useEdgeHandleRegistry } = await import("/src/state/definitions.ts");
    const { makeEdgeHandleKey } = await import(
      "/src/state/actions/edgeHandles.ts"
    );
    useEdgeHandleRegistry.setState((state) => {
      const nextPositions: Record<
        string,
        {
          sectionId: string;
          portId: string;
          type: "source" | "target";
          side: "left" | "right" | "top" | "bottom";
          x: number;
          y: number;
        }
      > = {};
      for (const handle of nextHandles) {
        const key = makeEdgeHandleKey(
          handle.sectionId,
          handle.portId,
          handle.type,
        );
        nextPositions[key] = {
          sectionId: handle.sectionId,
          portId: handle.portId,
          type: handle.type,
          side: handle.side,
          x: handle.x,
          y: handle.y,
        };
      }
      state.positions = nextPositions;
    });
  }, handles);
}

async function readEdgeHandleRegistryPositionCount(
  page: Page,
): Promise<number> {
  return await page.evaluate(async () => {
    const { useEdgeHandleRegistry } = await import("/src/state/definitions.ts");
    return Object.keys(useEdgeHandleRegistry.getState().positions).length;
  });
}

async function readSectionVariantId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const variantId =
    response?.projectState?.projectConfig?.sectionVariantMap?.[sectionId] ??
    null;
  if (!variantId) {
    throw new Error(`Missing variant id for section ${sectionId}.`);
  }
  return variantId;
}

async function readDataEdgeLinks(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const edges = response?.projectState?.projectConfig?.edges ?? [];
  return edges
    .filter(
      (edge) =>
        typeof edge.sourceSectionId === "string" &&
        typeof edge.sourcePortId === "string" &&
        typeof edge.targetSectionId === "string" &&
        typeof edge.targetPortId === "string",
    )
    .map(
      (edge) =>
        `${edge.sourceSectionId as string}:${edge.sourcePortId as string}->${edge.targetSectionId as string}:${edge.targetPortId as string}`,
    );
}

async function readDataEdgeIdByLink({
  page,
  projectConfigId,
  sourceSectionId,
  sourcePortId,
  targetSectionId,
  targetPortId,
}: {
  page: Page;
  projectConfigId: string;
  sourceSectionId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetPortId: string;
}): Promise<string> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const edges = response?.projectState?.projectConfig?.edges ?? [];
  for (const edge of edges) {
    if (
      edge.sourceSectionId === sourceSectionId &&
      edge.sourcePortId === sourcePortId &&
      edge.targetSectionId === targetSectionId &&
      edge.targetPortId === targetPortId &&
      typeof edge.id === "string"
    ) {
      return edge.id;
    }
  }
  throw new Error(
    `Unable to find data edge ${sourceSectionId}:${sourcePortId}->${targetSectionId}:${targetPortId}.`,
  );
}

async function readDataEdgeById(
  page: Page,
  projectConfigId: string,
  edgeId: string,
): Promise<{
  id: string;
  sourceSectionId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetPortId: string;
}> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const edges = response?.projectState?.projectConfig?.edges ?? [];
  for (const edge of edges) {
    if (
      edge.id === edgeId &&
      typeof edge.sourceSectionId === "string" &&
      typeof edge.sourcePortId === "string" &&
      typeof edge.targetSectionId === "string" &&
      typeof edge.targetPortId === "string"
    ) {
      return {
        id: edge.id,
        sourceSectionId: edge.sourceSectionId,
        sourcePortId: edge.sourcePortId,
        targetSectionId: edge.targetSectionId,
        targetPortId: edge.targetPortId,
      };
    }
  }
  throw new Error(`Unable to find data edge ${edgeId}.`);
}

function resolveAgenticHandleWorldPoint({
  layout,
  width,
  height,
  side,
}: {
  layout: { x: number; y: number };
  width: number;
  height: number;
  side: "source" | "target";
}): WorldPoint {
  const centerY = layout.y + height / 2;
  if (side === "source") {
    return {
      x: layout.x + width + AGENTIC_HANDLE_CENTER_OFFSET_WORLD,
      y: centerY,
    };
  }
  return {
    x: layout.x - AGENTIC_HANDLE_CENTER_OFFSET_WORLD,
    y: centerY,
  };
}

async function createAgenticEdge({
  page,
  projectConfigId,
  sourceSectionId,
  targetSectionId,
  kind,
  edgeId,
}: {
  page: Page;
  projectConfigId: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKind;
  edgeId?: string;
}): Promise<void> {
  await postBackend(page, "/createAgenticEdge", {
    projectConfigId,
    id: edgeId ?? null,
    sourceSectionId,
    targetSectionId,
    kind,
    contextMode: "reference_only",
    style: null,
    hidden: false,
    zIndex: 0,
  });
}

async function readAgenticEdgeLinks(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const edges = response?.projectState?.projectConfig?.agenticEdges ?? [];
  return edges
    .filter(
      (edge) =>
        typeof edge.sourceSectionId === "string" &&
        typeof edge.targetSectionId === "string" &&
        typeof edge.kind === "string",
    )
    .map(
      (edge) =>
        `${edge.sourceSectionId as string}->${edge.targetSectionId as string}:${edge.kind as string}`,
    );
}

async function readSelectedAgenticEdgeIds(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const edges = response?.projectState?.projectConfig?.agenticEdges ?? [];
  return edges
    .filter((edge) => edge.selected && typeof edge.id === "string")
    .map((edge) => edge.id as string);
}

async function readSelectedDataEdgeIds(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const edges = response?.projectState?.projectConfig?.edges ?? [];
  return edges
    .filter((edge) => edge.selected && typeof edge.id === "string")
    .map((edge) => edge.id as string);
}
