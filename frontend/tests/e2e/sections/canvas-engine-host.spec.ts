import { expect, test, type Locator, type Page } from "@playwright/test";
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
      sectionVariantMap?: Record<string, string>;
      viewport?: {
        x?: number;
        y?: number;
        zoom?: number;
      } | null;
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
        codeObjVariantMap?: Record<string, string>;
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

const MULTI_SELECTION_MODIFIER_KEY =
  process.platform === "darwin" ? "Meta" : "Control";
const DEFAULT_SECTION_WIDTH_FOR_HIT_TEST = 320;
const DEFAULT_SECTION_HEIGHT_FOR_HIT_TEST = 180;
const AGENTIC_HANDLE_CENTER_OFFSET_WORLD = 19;

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

test("canvas engine host mounts readable large sections below the old zoom cutoff", async ({
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

    const largeSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: await getEngineViewportBounds(page),
      position: { x: 80, y: 60 },
    });
    const smallSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds: await getEngineViewportBounds(page),
      position: { x: 1240, y: 60 },
    });

    await page.evaluate(
      async ({ nextTopLevelSections, nextViewport }) => {
        const { useProjectState } = await import("/src/state/definitions.ts");
        useProjectState.setState((state) => {
          state.projectConfig.topLevelSections = nextTopLevelSections;
          state.projectConfig.viewport = nextViewport;
          state.projectConfig.viewportInitialized = true;
        });
      },
      {
        nextTopLevelSections: {
          [largeSectionId]: {
            x: 80,
            y: 60,
            w: 960,
            h: 540,
            zIndex: 0,
          },
          [smallSectionId]: {
            x: 1240,
            y: 60,
            w: 320,
            h: 180,
            zIndex: 1,
          },
        },
        nextViewport: {
          x: 0,
          y: 0,
          zoom: 0.2,
        },
      },
    );

    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(
            host,
            "data-canvas-engine-dom-island-mounted-count",
          ),
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => (await readCamera(host)).zoom)
      .toBeCloseTo(0.2, 3);
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${largeSectionId}"]`),
    ).toHaveCount(1);
    await expect(
      host.locator(`[data-canvas-engine-dom-island="${smallSectionId}"]`),
    ).toHaveCount(0);
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
          return areCamerasClose(
            convertCameraToPersistedViewport(camera),
            persistedViewport,
          );
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

test("canvas engine host supports shift-drag marquee section selection", async ({
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
    const firstIsland = host.locator(
      `[data-canvas-engine-dom-island="${firstSectionId}"]`,
    );
    const secondIsland = host.locator(
      `[data-canvas-engine-dom-island="${secondSectionId}"]`,
    );
    await expect(firstIsland).toHaveCount(1);
    await expect(secondIsland).toHaveCount(1);

    const firstBounds = await firstIsland.boundingBox();
    const secondBounds = await secondIsland.boundingBox();
    if (!firstBounds || !secondBounds) {
      throw new Error("Unable to resolve DOM-island bounds for marquee test.");
    }

    const selectionStartScreen = {
      x: Math.min(firstBounds.x, secondBounds.x) - 24,
      y: Math.min(firstBounds.y, secondBounds.y) - 24,
    };
    const selectionEndScreen = {
      x:
        Math.max(
          firstBounds.x + firstBounds.width,
          secondBounds.x + secondBounds.width,
        ) + 24,
      y:
        Math.max(
          firstBounds.y + firstBounds.height,
          secondBounds.y + secondBounds.height,
        ) + 24,
    };

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
        .poll(async () => [...(await readActiveSectionIds(host))].sort())
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

test("canvas engine host marquee selection includes mounted nested group children", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const viewportBounds = await getEngineViewportBounds(page);
    const groupId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Group",
      viewportBounds,
      position: { x: 420, y: 120 },
    });
    const childId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Code",
      viewportBounds,
      position: { x: 80, y: 120 },
    });

    await postBackend(page, "/moveSections", {
      projectConfigId: projectContext.projectConfigId,
      sectionIds: [childId],
      newParentId: groupId,
      newIndex: 0,
      positionsById: null,
    });

    const groupIsland = host.locator(
      `[data-canvas-engine-dom-island="${groupId}"]`,
    );
    const childSection = groupIsland.locator(
      `section[data-section-id="${childId}"]`,
    );

    await expect(groupIsland).toHaveCount(1);
    await expect(childSection).toBeVisible();
    await expect.poll(async () => await readActiveSectionIds(host)).toEqual([]);

    const hostBounds = await host.boundingBox();
    const groupBounds = await groupIsland.boundingBox();
    const childBounds = await childSection.boundingBox();
    if (!hostBounds || !groupBounds || !childBounds) {
      throw new Error("Unable to resolve bounds for nested marquee test.");
    }

    const selectionStart = {
      x: Math.max(hostBounds.x + 16, groupBounds.x - 40),
      y: Math.max(hostBounds.y + 16, groupBounds.y - 20),
    };
    const selectionEnd = {
      x: Math.min(
        hostBounds.x + hostBounds.width - 16,
        childBounds.x + childBounds.width + 12,
      ),
      y: Math.min(
        hostBounds.y + hostBounds.height - 16,
        childBounds.y + childBounds.height + 12,
      ),
    };

    await page.keyboard.down("Shift");
    try {
      await page.mouse.move(selectionStart.x, selectionStart.y);
      await page.mouse.down();
      await page.mouse.move(selectionEnd.x, selectionEnd.y, {
        steps: 16,
      });

      await expect
        .poll(async () => (await readSelectionRectState(host)).active)
        .toBe(true);
      await page.mouse.up();
    } finally {
      await page.keyboard.up("Shift");
    }

    await expect
      .poll(async () => await readActiveSectionIds(host))
      .toContain(childId);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("canvas engine host creates data edges via handle drag", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const sourceSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    const targetSectionId = await createCallableSectionForCanvasEngine(
      page,
      projectContext.projectConfigId,
    );
    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(host, "data-canvas-engine-rect-count"),
      )
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

    const sourcePortId = "canvas-engine-source-port";
    const [targetPortId] = await readMountedSectionParamIds(
      host,
      targetSectionId,
      1,
    );
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

    const sourceIsland = host.locator(
      `[data-canvas-engine-dom-island="${sourceSectionId}"]`,
    );
    const targetIsland = host.locator(
      `[data-canvas-engine-dom-island="${targetSectionId}"]`,
    );
    await expect(sourceIsland).toHaveCount(1);
    await expect(targetIsland).toHaveCount(1);

    const sourceBounds = await sourceIsland.boundingBox();
    const targetBounds = await targetIsland.boundingBox();
    if (!sourceBounds || !targetBounds) {
      throw new Error("Unable to resolve DOM-island bounds for edge drag.");
    }

    const sourceHandleScreen = {
      x: sourceBounds.x + sourceBounds.width,
      y: sourceBounds.y + sourceBounds.height / 2,
    };
    const targetHandleScreen = {
      x: targetBounds.x,
      y: targetBounds.y + targetBounds.height / 2,
    };
    const sourceHandle = await screenPointToWorld(host, sourceHandleScreen);
    const targetHandle = await screenPointToWorld(host, targetHandleScreen);

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
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const hostBounds = await host.boundingBox();
    if (!hostBounds) {
      throw new Error("Unable to resolve canvas host bounds.");
    }
    const sourcePosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.28,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const firstTargetPosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.54,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const secondTargetPosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.78,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const viewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: sourcePosition,
    });
    const firstTargetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: firstTargetPosition,
    });
    const secondTargetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: secondTargetPosition,
    });
    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(host, "data-canvas-engine-rect-count"),
      )
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

    const sourcePortId = "canvas-engine-reconnect-source-port";
    const [firstTargetPortId] = await readMountedSectionParamIds(
      host,
      firstTargetSectionId,
      1,
    );
    const [secondTargetPortId] = await readMountedSectionParamIds(
      host,
      secondTargetSectionId,
      1,
    );
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

    const sourceHandle = await resolveDataHandleWorldPoint(
      host,
      sourceSectionId,
      "source",
    );
    const firstTargetHandle = await resolveDataHandleWorldPoint(
      host,
      firstTargetSectionId,
      "target",
    );
    const secondTargetHandle = await resolveDataHandleWorldPoint(
      host,
      secondTargetSectionId,
      "target",
    );
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

    const edgeId = await readDataEdgeIdByLink({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      sourcePortId,
      targetSectionId: firstTargetSectionId,
      targetPortId: firstTargetPortId,
    });

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
      { steps: 10 },
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
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const hostBounds = await host.boundingBox();
    if (!hostBounds) {
      throw new Error("Unable to resolve canvas host bounds.");
    }
    const sourcePosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.34,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const targetPosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.72,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const viewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(host, "data-canvas-engine-rect-count"),
      )
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

    const sourcePortId = "canvas-engine-hover-source-port";
    const [targetPortId] = await readMountedSectionParamIds(
      host,
      targetSectionId,
      1,
    );
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
      .poll(
        async () =>
          await readNumericHostAttribute(
            host,
            "data-canvas-engine-data-edge-count",
          ),
      )
      .toBeGreaterThanOrEqual(1);

    const sourceHandle = await resolveDataHandleWorldPoint(
      host,
      sourceSectionId,
      "source",
    );
    const targetHandle = await resolveDataHandleWorldPoint(
      host,
      targetSectionId,
      "target",
    );
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

    const edgeId = await readDataEdgeIdByLink({
      page,
      projectConfigId: projectContext.projectConfigId,
      sourceSectionId,
      sourcePortId,
      targetSectionId,
      targetPortId,
    });

    const sourceHandleScreen = await resolveDataHandleScreenPoint(
      host,
      sourceSectionId,
      "source",
    );
    const targetHandleScreen = await resolveDataHandleScreenPoint(
      host,
      targetSectionId,
      "target",
    );
    const edgeMidpointScreen = {
      x: Math.round((sourceHandleScreen.x + targetHandleScreen.x) / 2),
      y: Math.round((sourceHandleScreen.y + targetHandleScreen.y) / 2),
    };
    await dispatchCanvasHostPointerEvent(host, "pointermove", {
      button: 0,
      clientX: edgeMidpointScreen.x,
      clientY: edgeMidpointScreen.y,
      pointerId: 1,
    });

    await expect
      .poll(async () => await readHoveredEdgeState(host))
      .toEqual({
        active: true,
        kind: "data",
        id: edgeId,
      });

    await dispatchCanvasHostPointerEvent(host, "pointerdown", {
      button: 0,
      clientX: edgeMidpointScreen.x,
      clientY: edgeMidpointScreen.y,
      pointerId: 1,
    });
    await dispatchCanvasHostPointerEvent(host, "pointerup", {
      button: 0,
      clientX: edgeMidpointScreen.x,
      clientY: edgeMidpointScreen.y,
      pointerId: 1,
    });

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
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const hostBounds = await host.boundingBox();
    if (!hostBounds) {
      throw new Error("Unable to resolve canvas host bounds.");
    }
    const sourcePosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.34,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const targetPosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.72,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const viewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Chat",
      viewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(host, "data-canvas-engine-rect-count"),
      )
      .toBeGreaterThanOrEqual(2);

    const sourceHandle = await resolveAgenticHandleWorldPoint(
      host,
      sourceSectionId,
      "source",
    );
    const targetHandle = await resolveAgenticHandleWorldPoint(
      host,
      targetSectionId,
      "target",
    );

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
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await seedLocalStorage(page, { useCanvasEngineV1: true });
    await page.reload({ waitUntil: "domcontentloaded" });

    const host = page.locator('[data-canvas-engine-host="v1"]');
    await expect(host).toBeVisible();

    const hostBounds = await host.boundingBox();
    if (!hostBounds) {
      throw new Error("Unable to resolve canvas host bounds.");
    }
    const sourcePosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.34,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const targetPosition = await screenPointToWorld(host, {
      x: hostBounds.x + hostBounds.width * 0.72,
      y: hostBounds.y + hostBounds.height * 0.42,
    });
    const viewportBounds = await getEngineViewportBounds(page);

    const sourceSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
      viewportBounds,
      position: sourcePosition,
    });
    const targetSectionId = await createTopLevelSection({
      page,
      projectConfigId: projectContext.projectConfigId,
      implType: "Chat",
      viewportBounds,
      position: targetPosition,
    });
    await expect
      .poll(
        async () =>
          await readNumericHostAttribute(host, "data-canvas-engine-rect-count"),
      )
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
      .poll(
        async () =>
          await readNumericHostAttribute(
            host,
            "data-canvas-engine-agentic-edge-count",
          ),
      )
      .toBeGreaterThanOrEqual(1);

    const sourceHandle = await resolveAgenticHandleWorldPoint(
      host,
      sourceSectionId,
      "source",
    );
    const targetHandle = await resolveAgenticHandleWorldPoint(
      host,
      targetSectionId,
      "target",
    );
    const sourceHandleScreen = await resolveAgenticHandleScreenPoint(
      host,
      sourceSectionId,
      "source",
    );
    const targetHandleScreen = await resolveAgenticHandleScreenPoint(
      host,
      targetSectionId,
      "target",
    );
    const edgeMidpointScreen = {
      x: Math.round((sourceHandleScreen.x + targetHandleScreen.x) / 2),
      y: Math.round((sourceHandleScreen.y + targetHandleScreen.y) / 2),
    };

    await dispatchCanvasHostPointerEvent(host, "pointermove", {
      button: 0,
      clientX: edgeMidpointScreen.x,
      clientY: edgeMidpointScreen.y,
      pointerId: 1,
    });

    await expect
      .poll(async () => await readHoveredEdgeState(host))
      .toEqual({
        active: true,
        kind: "agentic",
        id: edgeId,
      });

    await dispatchCanvasHostPointerEvent(host, "pointerdown", {
      button: 0,
      clientX: edgeMidpointScreen.x,
      clientY: edgeMidpointScreen.y,
      pointerId: 1,
    });
    await dispatchCanvasHostPointerEvent(host, "pointerup", {
      button: 0,
      clientX: edgeMidpointScreen.x,
      clientY: edgeMidpointScreen.y,
      pointerId: 1,
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
  const viewportBounds = await getEngineViewportBounds(page);
  return createTopLevelSection({
    page,
    projectConfigId,
    implType: "Callable",
    viewportBounds,
  });
}

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
  viewportBounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  position?: WorldPoint;
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

async function getEngineViewportBounds(page: Page): Promise<{
  x: number;
  y: number;
  w: number;
  h: number;
}> {
  return await page.evaluate(() => ({
    x: 0,
    y: 0,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
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

async function readMountedSectionParamIds(
  host: Locator,
  sectionId: string,
  minCount: number,
): Promise<string[]> {
  const sectionNode = host.locator(
    `[data-canvas-engine-dom-island="${sectionId}"] section[data-section-id="${sectionId}"]`,
  );
  const idPrefix = `ParamContainer-${sectionId}-`;
  await expect(sectionNode).toBeVisible();
  await expect(sectionNode.locator(`[id^="${idPrefix}"]`).first()).toBeVisible({
    timeout: 20_000,
  });
  const ids = await sectionNode.locator(`[id^="${idPrefix}"]`).evaluateAll(
    (nodes, prefix) =>
      nodes
        .map((node) => node.id)
        .filter((id) => id.startsWith(prefix))
        .map((id) => id.slice(prefix.length)),
    idPrefix,
  );
  if (ids.length < minCount) {
    throw new Error(
      `Expected at least ${minCount} params in section ${sectionId}. Found ${ids.length}.`,
    );
  }
  return ids;
}

async function setCanvasEngineEdgeHandlePositions(
  page: Page,
  handles: Array<{
    sectionId: string;
    portId: string;
    type: "source" | "target";
    side: "left" | "right";
    x: number;
    y: number;
  }>,
): Promise<void> {
  await page.evaluate(async (entries) => {
    const { useEdgeHandleRegistry } = await import("/src/state/definitions.ts");
    const { makeEdgeHandleKey } = await import(
      "/src/state/actions/edgeHandles.ts"
    );
    useEdgeHandleRegistry.setState((state) => {
      for (const entry of entries) {
        state.positions[
          makeEdgeHandleKey(entry.sectionId, entry.portId, entry.type)
        ] = {
          sectionId: entry.sectionId,
          portId: entry.portId,
          type: entry.type,
          side: entry.side,
          x: entry.x,
          y: entry.y,
        };
      }
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

function convertCameraToPersistedViewport(
  camera: CanvasEngineCameraSnapshot,
): CanvasEngineCameraSnapshot {
  return {
    x: -camera.x * camera.zoom,
    y: -camera.y * camera.zoom,
    zoom: camera.zoom,
  };
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

async function dispatchCanvasHostPointerEvent(
  host: Locator,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: {
    button: number;
    clientX: number;
    clientY: number;
    pointerId: number;
  },
): Promise<void> {
  await host.evaluate(
    (element, eventInit) => {
      element.dispatchEvent(
        new PointerEvent(eventInit.type, {
          bubbles: true,
          cancelable: true,
          button: eventInit.button,
          clientX: eventInit.clientX,
          clientY: eventInit.clientY,
          pointerId: eventInit.pointerId,
        }),
      );
    },
    {
      type,
      button: init.button,
      clientX: init.clientX,
      clientY: init.clientY,
      pointerId: init.pointerId,
    },
  );
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

async function screenPointToWorld(
  host: Locator,
  screenPoint: WorldPoint,
): Promise<WorldPoint> {
  const hostBounds = await host.boundingBox();
  if (!hostBounds) {
    throw new Error("Unable to resolve canvas host bounds.");
  }
  const camera = await readCamera(host);
  return {
    x: camera.x + (screenPoint.x - hostBounds.x) / camera.zoom,
    y: camera.y + (screenPoint.y - hostBounds.y) / camera.zoom,
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
  return {
    active: parseBooleanHostAttribute(
      "data-canvas-engine-hovered-edge-active",
      await host.getAttribute("data-canvas-engine-hovered-edge-active"),
    ),
    kind:
      (await host.getAttribute("data-canvas-engine-hovered-edge-kind")) ?? "",
    id: (await host.getAttribute("data-canvas-engine-hovered-edge-id")) ?? "",
  };
}

async function readSelectionRectState(
  host: Locator,
): Promise<CanvasEngineSelectionRectState> {
  const activeRaw = await host.getAttribute(
    "data-canvas-engine-selection-rect-active",
  );
  return {
    active: parseBooleanHostAttribute(
      "data-canvas-engine-selection-rect-active",
      activeRaw,
    ),
    x: parseNumericHostAttribute(
      "data-canvas-engine-selection-rect-x",
      await host.getAttribute("data-canvas-engine-selection-rect-x"),
    ),
    y: parseNumericHostAttribute(
      "data-canvas-engine-selection-rect-y",
      await host.getAttribute("data-canvas-engine-selection-rect-y"),
    ),
    width: parseNumericHostAttribute(
      "data-canvas-engine-selection-rect-width",
      await host.getAttribute("data-canvas-engine-selection-rect-width"),
    ),
    height: parseNumericHostAttribute(
      "data-canvas-engine-selection-rect-height",
      await host.getAttribute("data-canvas-engine-selection-rect-height"),
    ),
  };
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

async function resolveDataHandleWorldPoint(
  host: Locator,
  sectionId: string,
  handleType: "source" | "target",
): Promise<WorldPoint> {
  const handleScreenPoint = await resolveDataHandleScreenPoint(
    host,
    sectionId,
    handleType,
  );
  return await screenPointToWorld(host, handleScreenPoint);
}

async function resolveDataHandleScreenPoint(
  host: Locator,
  sectionId: string,
  handleType: "source" | "target",
): Promise<WorldPoint> {
  const sectionBounds = await host
    .locator(`[data-canvas-engine-dom-island="${sectionId}"]`)
    .boundingBox();
  if (!sectionBounds) {
    throw new Error(`Missing DOM-island bounds for section ${sectionId}.`);
  }
  return {
    x:
      handleType === "source"
        ? sectionBounds.x + sectionBounds.width
        : sectionBounds.x,
    y: sectionBounds.y + sectionBounds.height / 2,
  };
}

async function resolveAgenticHandleWorldPoint(
  host: Locator,
  sectionId: string,
  side: "source" | "target",
): Promise<WorldPoint> {
  const handleScreenPoint = await resolveAgenticHandleScreenPoint(
    host,
    sectionId,
    side,
  );
  return await screenPointToWorld(host, handleScreenPoint);
}

async function resolveAgenticHandleScreenPoint(
  host: Locator,
  sectionId: string,
  side: "source" | "target",
): Promise<WorldPoint> {
  const sectionBounds = await host
    .locator(`[data-canvas-engine-dom-island="${sectionId}"]`)
    .boundingBox();
  if (!sectionBounds) {
    throw new Error(`Missing DOM-island bounds for section ${sectionId}.`);
  }
  const zoom = (await readCamera(host)).zoom;
  return {
    x:
      side === "source"
        ? sectionBounds.x +
          sectionBounds.width +
          AGENTIC_HANDLE_CENTER_OFFSET_WORLD * zoom
        : sectionBounds.x - AGENTIC_HANDLE_CENTER_OFFSET_WORLD * zoom,
    y: sectionBounds.y + sectionBounds.height / 2,
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

function parseBooleanHostAttribute(
  attributeName: string,
  rawValue: string | null,
): boolean {
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  throw new Error(
    `Invalid boolean host attribute ${attributeName}: ${String(rawValue)}`,
  );
}

function parseNumericHostAttribute(
  attributeName: string,
  rawValue: string | null,
): number | null {
  if (rawValue === null || rawValue === "") {
    return null;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid numeric host attribute ${attributeName}: ${String(rawValue)}`,
    );
  }
  return parsed;
}
