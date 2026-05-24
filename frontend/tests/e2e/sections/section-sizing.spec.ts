import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  hoverGpuFlowNode,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
  setCallableFromFrontend,
  setSectionSizesFromFrontend,
  type SingleConfigResponse,
} from "../helpers";

async function createSection(
  page: Page,
  projectConfigId: string,
  implType: string,
  placement: {
    readonly xRatio?: number | undefined;
    readonly yRatio?: number | undefined;
  } = {},
) {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const state = await loadProjectConfig(page);
  const viewport = state.projectConfig.viewport ?? { x: 0, y: 0, zoom: 1 };
  const flowViewportBounds = {
    h: viewportBounds.h / viewport.zoom,
    w: viewportBounds.w / viewport.zoom,
    x: (viewportBounds.x - viewport.x) / viewport.zoom,
    y: (viewportBounds.y - viewport.y) / viewport.zoom,
  };
  const xRatio = placement.xRatio ?? 0.35;
  const yRatio = placement.yRatio ?? 0.35;
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
    position: {
      x: flowViewportBounds.x + flowViewportBounds.w * xRatio,
      y: flowViewportBounds.y + flowViewportBounds.h * yRatio,
    },
    viewportBounds: flowViewportBounds,
  });
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId for ${implType} creation.`);
  }
  return response.sectionId;
}

async function setSectionSizes(
  page: Page,
  projectConfigId: string,
  sectionSizes: Record<
    string,
    { height?: number | "auto"; width?: number | "auto" }
  >,
) {
  const latestStateResponse = await postBackend<{
    projectState?: SingleConfigResponse | null;
  }>(page, "/getLatestProjectState", {
    projectConfigId,
  });
  const latestState = latestStateResponse?.projectState;
  if (!latestState) {
    throw new Error("Missing latest project state for setSectionSizes.");
  }
  const normalizedSectionSizes = Object.fromEntries(
    Object.entries(sectionSizes).map(([sectionId, nextSize]) => {
      const currentSize = getSectionSizeFromState(latestState, sectionId);
      return [
        sectionId,
        {
          width: nextSize.width ?? currentSize.width,
          height: nextSize.height ?? currentSize.height,
        },
      ];
    }),
  );
  await setSectionSizesFromFrontend(page, {
    projectConfigId,
    sectionSizes: normalizedSectionSizes,
  });
}

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
) {
  await setCallableFromFrontend(page, {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams: true,
  });
}

async function addKwargs(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  count: number,
) {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: Array.from({ length: count }, () => ({
      operationName: "addKwarg",
      body: {
        sectionId,
      },
    })),
  });
}

async function setActiveSections(page: Page, sectionIds: readonly string[]) {
  await page.evaluate(async (ids) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections"
    );
    setActiveSectionIds([...ids], { syncMode: "ui-only" });
  }, sectionIds);
}

function getSectionSizeFromState(
  state: SingleConfigResponse,
  sectionId: string,
) {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    throw new Error(`Missing variant for section ${sectionId}`);
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    throw new Error(`Missing variant ${variantId} for section ${sectionId}`);
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    throw new Error(`Missing impl ${variant.impl} for section ${sectionId}`);
  }
  const core = state.sections[sectionId];
  const sharedSize = core?.sharedModifier?.size;
  const variantSize = variant?.modifier?.size;
  return sharedSize ?? variantSize ?? impl.size;
}

async function getResizeEvent(page: Page, sectionId: string) {
  return await page.evaluate(async (id) => {
    const { useResizeEvent } = await import("/src/state/definitions");
    return useResizeEvent.getState().resizeEvent[id] ?? null;
  }, sectionId);
}

async function clearResizeEvent(page: Page, sectionId: string) {
  await page.evaluate(async (id) => {
    const { useResizeEvent } = await import("/src/state/definitions");
    useResizeEvent.setState((state) => {
      delete state.resizeEvent[id];
    });
  }, sectionId);
}

async function waitForAnimationFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function getRetainedParamResizeGeometry({
  page,
  sectionId,
  sectionNode,
}: {
  readonly page: Page;
  readonly sectionId: string;
  readonly sectionNode: Locator;
}) {
  const [sectionBox, retainedBox] = await Promise.all([
    sectionNode.boundingBox(),
    readRetainedParamSurfaceBox(page, sectionId),
  ]);
  if (!sectionBox || !retainedBox) {
    throw new Error("Missing section or retained content geometry.");
  }
  return {
    retainedHeight: retainedBox.height,
    retainedWidth: retainedBox.width,
    sectionHeight: sectionBox.height,
    sectionWidth: sectionBox.width,
  };
}

async function readRetainedParamOverflow({
  page,
  sectionId,
  sectionNode,
}: {
  readonly page: Page;
  readonly sectionId: string;
  readonly sectionNode: Locator;
}): Promise<number | null> {
  const [sectionBox, retainedBox] = await Promise.all([
    sectionNode.boundingBox(),
    readRetainedParamSurfaceBox(page, sectionId),
  ]);
  if (!sectionBox || !retainedBox) {
    return null;
  }
  return retainedBox.height - sectionBox.height;
}

async function readRetainedParamSurfaceBox(
  page: Page,
  sectionId: string,
): Promise<{
  readonly height: number;
  readonly width: number;
} | null> {
  return await page.evaluate((surfaceId) => {
    const rows = (
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
    ).filter((row) => row.surfaceId === surfaceId);
    if (rows.length === 0) {
      return null;
    }
    const left = Math.min(...rows.map((row) => row.clientRect.x));
    const top = Math.min(...rows.map((row) => row.clientRect.y));
    const right = Math.max(
      ...rows.map((row) => row.clientRect.x + row.clientRect.width),
    );
    const bottom = Math.max(
      ...rows.map((row) => row.clientRect.y + row.clientRect.height),
    );
    return {
      height: bottom - top,
      width: right - left,
    };
  }, `${sectionId}:param-content:unpinned`);
}

type GpuResizeHandleDirection = "bottom" | "bottomRight" | "right";

async function resolveSectionResizeHandlePoint(
  page: Page,
  sectionId: string,
  direction: GpuResizeHandleDirection,
): Promise<{ x: number; y: number }> {
  await expect
    .poll(async () => await readGpuFlowNodeScreenRect(page, sectionId))
    .not.toBeNull();
  const rect = await readGpuFlowNodeScreenRect(page, sectionId);
  if (!rect) {
    throw new Error(`Missing GPU node rect for ${sectionId}.`);
  }
  if (direction === "right") {
    return {
      x: rect.x + rect.width - 4,
      y: rect.y + rect.height / 2,
    };
  }
  if (direction === "bottom") {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height - 4,
    };
  }
  return {
    x: rect.x + rect.width - 4,
    y: rect.y + rect.height - 4,
  };
}

async function readGpuFlowNodeScreenRect(
  page: Page,
  nodeId: string,
): Promise<{ height: number; width: number; x: number; y: number } | null> {
  return await page.evaluate((nodeId) => {
    return (
      (
        window as typeof window & {
          __settaGpuFlowNodeScreenRect?: (
            nodeId: string,
          ) => { height: number; width: number; x: number; y: number } | null;
        }
      ).__settaGpuFlowNodeScreenRect?.(nodeId) ?? null
    );
  }, nodeId);
}

async function readSectionResizeDirections(
  page: Page,
  sectionId: string,
): Promise<readonly string[]> {
  return await page.evaluate(async (sectionId) => {
    const { getProjectGpuFlowScene } = await import(
      "/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    return (
      scene.sections.find((section) => section.sectionId === sectionId)
        ?.resizePolicy.directions ?? []
    );
  }, sectionId);
}

function isolatedSizingTest(
  name: string,
  run: (page: Page, projectConfigId: string) => Promise<void>,
) {
  test(name, async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    try {
      await run(page, projectContext.projectConfigId);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
}

isolatedSizingTest(
  "chart resize clamps to min and persists size",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "Chart");

    try {
      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await hoverGpuFlowNode(page, sectionNode);

      const start = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "bottomRight",
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x - 200, start.y - 200);
      await page.mouse.up();

      await expect
        .poll(async () => {
          const state = await loadProjectConfig(page);
          const size = getSectionSizeFromState(state, sectionId);
          return typeof size.width === "number" ? size.width : 0;
        })
        .toBeGreaterThanOrEqual(300);

      await expect
        .poll(async () => {
          const state = await loadProjectConfig(page);
          const size = getSectionSizeFromState(state, sectionId);
          return typeof size.height === "number" ? size.height : 0;
        })
        .toBeGreaterThanOrEqual(300);
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "meta control slider only shows width resize handle",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "MetaControl");

    try {
      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();

      const sectionCard = sectionNode.locator(
        `section[data-section-id="${sectionId}"]`,
      );
      await expect(sectionCard).toBeVisible();
      await hoverGpuFlowNode(page, sectionCard);

      await expect
        .poll(async () => await readSectionResizeDirections(page, sectionId))
        .toEqual(["right"]);

      await expect
        .poll(async () => await readSectionResizeDirections(page, sectionId))
        .toEqual(["right"]);
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "callable retained param content resizes while the pointer is down",
  async (page, projectConfigId) => {
    await page.addStyleTag({
      content: `
        #OverviewPane,
        #UiEditorPane {
          pointer-events: none !important;
        }
      `,
    });
    const sectionId = await createSection(page, projectConfigId, "Callable", {
      xRatio: 0.08,
      yRatio: 0.25,
    });

    try {
      await setCallable(page, projectConfigId, sectionId, "sorted");
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: 320, width: 420 },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await expect
        .poll(
          async () =>
            (await readRetainedParamSurfaceBox(page, sectionId))?.width ?? 0,
        )
        .toBeGreaterThan(360);

      await setActiveSections(page, [sectionId]);
      await hoverGpuFlowNode(page, sectionNode);
      const before = await getRetainedParamResizeGeometry({
        page,
        sectionId,
        sectionNode,
      });
      const startPoint = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "right",
      );
      const startX = startPoint.x;
      const startY = startPoint.y;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 80, startY);
      await waitForAnimationFrame(page);
      const shrinkDuringDrag = await getRetainedParamResizeGeometry({
        page,
        sectionId,
        sectionNode,
      });

      expect(shrinkDuringDrag.sectionWidth).toBeLessThan(
        before.sectionWidth - 40,
      );
      expect(shrinkDuringDrag.retainedWidth).toBeLessThan(
        before.retainedWidth - 40,
      );
      expect(
        Math.abs(
          shrinkDuringDrag.sectionWidth - shrinkDuringDrag.retainedWidth,
        ),
      ).toBeLessThan(8);

      await page.mouse.move(startX + 80, startY);
      await waitForAnimationFrame(page);
      await waitForAnimationFrame(page);
      const growDuringDrag = await getRetainedParamResizeGeometry({
        page,
        sectionId,
        sectionNode,
      });

      expect(growDuringDrag.sectionWidth).toBeGreaterThan(
        shrinkDuringDrag.sectionWidth + 120,
      );
      expect(growDuringDrag.retainedWidth).toBeGreaterThan(
        shrinkDuringDrag.retainedWidth + 120,
      );
      expect(
        Math.abs(growDuringDrag.sectionWidth - growDuringDrag.retainedWidth),
      ).toBeLessThan(8);

      await page.mouse.up();
      await waitForAnimationFrame(page);
      const firstAfterRelease = await getRetainedParamResizeGeometry({
        page,
        sectionId,
        sectionNode,
      });
      await waitForAnimationFrame(page);
      await waitForAnimationFrame(page);
      const settledAfterRelease = await getRetainedParamResizeGeometry({
        page,
        sectionId,
        sectionNode,
      });

      expect(
        Math.abs(
          firstAfterRelease.retainedWidth - settledAfterRelease.retainedWidth,
        ),
      ).toBeLessThan(8);
      expect(
        Math.abs(
          firstAfterRelease.sectionWidth - settledAfterRelease.sectionWidth,
        ),
      ).toBeLessThan(8);
    } finally {
      await page.mouse.up().catch(() => {});
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "setSectionSizes updates node dimensions",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "TextBlock");

    try {
      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();

      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { width: 520, height: 260 },
      });

      await expect
        .poll(async () => {
          const box = await sectionNode.boundingBox();
          return box?.width ?? 0;
        })
        .toBeGreaterThan(500);
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "callable resize exits auto height cap",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "Callable", {
      xRatio: 0.2,
      yRatio: 0.12,
    });

    try {
      await setCallable(page, projectConfigId, sectionId, "sorted");
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await expect
        .poll(
          async () =>
            (await readRetainedParamSurfaceBox(page, sectionId))?.height ?? 0,
          { timeout: 20000 },
        )
        .toBeGreaterThan(0);
      await setActiveSections(page, [sectionId]);
      await hoverGpuFlowNode(page, sectionNode);

      await expect
        .poll(async () => {
          const state = await loadProjectConfig(page);
          const size = getSectionSizeFromState(state, sectionId);
          return size.height;
        })
        .toBe("auto");

      const start = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "bottomRight",
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y + 80);
      await page.mouse.up();

      await expect
        .poll(async () => {
          const state = await loadProjectConfig(page);
          const size = getSectionSizeFromState(state, sectionId);
          return typeof size.height === "number";
        })
        .toBe(true);
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "resize start does not jump at zoom",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "Callable");

    try {
      await setCallable(page, projectConfigId, sectionId, "sorted");
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await expect
        .poll(
          async () =>
            (await readRetainedParamSurfaceBox(page, sectionId))?.height ?? 0,
          { timeout: 20000 },
        )
        .toBeGreaterThan(0);
      await sectionNode.scrollIntoViewIfNeeded();

      await expect
        .poll(
          async () => {
            return await page.evaluate(() => {
              return typeof window.settaGpuFlowZoom === "number";
            });
          },
          { timeout: 10000 },
        )
        .toBe(true);

      await page.evaluate(async () => {
        const dispatchZoomOut = () => {
          const eventInit = {
            code: "Minus",
            key: "-",
            bubbles: true,
          };
          document.dispatchEvent(new KeyboardEvent("keydown", eventInit));
          document.dispatchEvent(new KeyboardEvent("keyup", eventInit));
        };
        dispatchZoomOut();
        await new Promise((resolve) => setTimeout(resolve, 80));
        dispatchZoomOut();
      });

      await expect
        .poll(
          async () => {
            return await page.evaluate(() => {
              return typeof window.settaGpuFlowZoom === "number"
                ? window.settaGpuFlowZoom
                : 1;
            });
          },
          { timeout: 10000 },
        )
        .toBeLessThan(0.8);

      await hoverGpuFlowNode(page, sectionNode);

      const beforeBox = await sectionNode.boundingBox();
      if (!beforeBox) {
        throw new Error("Missing section bounding box.");
      }
      const beforeHeight = beforeBox.height;

      const start = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "bottom",
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.up();

      await expect
        .poll(async () => {
          const state = await loadProjectConfig(page);
          const size = getSectionSizeFromState(state, sectionId);
          return size.height;
        })
        .toBe("auto");

      await expect
        .poll(async () => {
          const afterBox = await sectionNode.boundingBox();
          const afterHeight = afterBox?.height ?? 0;
          return Math.abs(afterHeight - beforeHeight);
        })
        .toBeLessThan(6);
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
      await postBackend(page, "/setViewport", {
        projectConfigId,
        viewport: null,
      });
    }
  },
);

isolatedSizingTest(
  "right resize handle mousedown does not expand auto height with overflow",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "Dict", {
      xRatio: 0.2,
      yRatio: 0.12,
    });

    try {
      await addKwargs(page, projectConfigId, sectionId, 40);
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await sectionNode.scrollIntoViewIfNeeded();
      await hoverGpuFlowNode(page, sectionNode);

      await expect
        .poll(async () => {
          return (
            (await readRetainedParamOverflow({
              page,
              sectionId,
              sectionNode,
            })) ?? 0
          );
        })
        .toBeGreaterThan(40);

      const beforeBox = await sectionNode.boundingBox();
      if (!beforeBox) {
        throw new Error("Missing section bounding box.");
      }
      const beforeHeight = beforeBox.height;

      const start = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "right",
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();

      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });

      const afterBox = await sectionNode.boundingBox();
      if (!afterBox) {
        throw new Error("Missing section bounding box after mousedown.");
      }
      const afterHeight = afterBox.height;

      const overflowAfter = await readRetainedParamOverflow({
        page,
        sectionId,
        sectionNode,
      });
      if (overflowAfter === null) {
        throw new Error("Missing retained overflow after mousedown.");
      }

      await page.mouse.up();

      expect(Math.abs(afterHeight - beforeHeight)).toBeLessThan(6);
      expect(overflowAfter).toBeGreaterThan(40);
    } finally {
      await page.mouse.up().catch(() => {});
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "bottom resize handle mousedown does not expand auto height with overflow",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "Dict", {
      xRatio: 0.2,
      yRatio: 0.12,
    });

    try {
      await addKwargs(page, projectConfigId, sectionId, 40);
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await sectionNode.scrollIntoViewIfNeeded();
      await hoverGpuFlowNode(page, sectionNode);

      await expect
        .poll(async () => {
          return (
            (await readRetainedParamOverflow({
              page,
              sectionId,
              sectionNode,
            })) ?? 0
          );
        })
        .toBeGreaterThan(40);

      const beforeBox = await sectionNode.boundingBox();
      if (!beforeBox) {
        throw new Error("Missing section bounding box.");
      }
      const beforeHeight = beforeBox.height;

      const start = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "bottom",
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();

      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });

      const afterBox = await sectionNode.boundingBox();
      if (!afterBox) {
        throw new Error("Missing section bounding box after mousedown.");
      }
      const afterHeight = afterBox.height;

      const overflowAfter = await readRetainedParamOverflow({
        page,
        sectionId,
        sectionNode,
      });
      if (overflowAfter === null) {
        throw new Error("Missing retained overflow after mousedown.");
      }

      await page.mouse.up();

      expect(Math.abs(afterHeight - beforeHeight)).toBeLessThan(6);
      expect(overflowAfter).toBeGreaterThan(40);
    } finally {
      await page.mouse.up().catch(() => {});
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);

isolatedSizingTest(
  "bottom resize handle mousedown does not start resize event for auto height overflow",
  async (page, projectConfigId) => {
    const sectionId = await createSection(page, projectConfigId, "Dict", {
      xRatio: 0.2,
      yRatio: 0.12,
    });

    try {
      await addKwargs(page, projectConfigId, sectionId, 40);
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await sectionNode.scrollIntoViewIfNeeded();
      await hoverGpuFlowNode(page, sectionNode);

      await expect
        .poll(async () => {
          return (
            (await readRetainedParamOverflow({
              page,
              sectionId,
              sectionNode,
            })) ?? 0
          );
        })
        .toBeGreaterThan(40);

      await clearResizeEvent(page, sectionId);

      const start = await resolveSectionResizeHandlePoint(
        page,
        sectionId,
        "bottom",
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();

      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });

      const resizeEvent = await getResizeEvent(page, sectionId);
      expect(resizeEvent).not.toBe("start");
    } finally {
      await page.mouse.up().catch(() => {});
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);
