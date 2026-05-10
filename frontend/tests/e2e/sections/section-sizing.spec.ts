import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
  setCallableFromFrontend,
  setSectionSizesFromFrontend,
  type SingleConfigResponse,
} from "../helpers";

const SECTION_SHELL_CHROME_PX = 2;

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

async function resolveSectionResizeStartPoint(page: Page, sectionId: string) {
  const state = await loadProjectConfig(page);
  const layout = state.projectConfig.topLevelSections?.[sectionId];
  if (!layout) {
    throw new Error(`Missing top-level layout for ${sectionId}.`);
  }
  const size = getSectionSizeFromState(state, sectionId);
  if (typeof size.width !== "number" || typeof size.height !== "number") {
    throw new Error(`Missing numeric size for ${sectionId}.`);
  }
  const paneBox = await page.locator(".setta-gpu-flow__pane").boundingBox();
  if (!paneBox) {
    throw new Error("Missing GPU flow pane for resize pointer placement.");
  }
  const viewport = state.projectConfig.viewport ?? { x: 0, y: 0, zoom: 1 };
  const outerWidth = size.width + SECTION_SHELL_CHROME_PX;
  const outerHeight = size.height + SECTION_SHELL_CHROME_PX;
  return {
    x: paneBox.x + viewport.x + (layout.x + outerWidth - 4) * viewport.zoom,
    y: paneBox.y + viewport.y + (layout.y + outerHeight - 4) * viewport.zoom,
  };
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

      const handle = sectionNode.locator(".section-resize-handle-bottom-right");
      await expect(handle).toHaveCount(1);
      await sectionNode.hover();

      const box = await handle.boundingBox();
      if (!box) {
        throw new Error("Missing resize handle bounding box.");
      }

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 200, box.y - 200);
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
      await sectionCard.hover();

      await expect(sectionNode.locator(".cursor-col-resize")).toHaveCount(1);
      await expect(sectionNode.locator(".cursor-row-resize")).toHaveCount(0);
      await expect(sectionNode.locator(".cursor-nwse-resize")).toHaveCount(0);

      const menuTrigger = sectionNode.locator(
        'button[class*="group-hover/card-section:pointer-events-auto"]',
      );
      await expect(menuTrigger).toHaveCount(1);

      const sectionBox = await sectionNode.boundingBox();
      const menuBox = await menuTrigger.boundingBox();
      if (!sectionBox || !menuBox) {
        throw new Error("Missing section/menu bounds for meta control.");
      }

      const menuPoint = {
        x: menuBox.x + menuBox.width / 2,
        y: menuBox.y + menuBox.height / 2,
      };

      expect(menuPoint.x).toBeLessThan(sectionBox.x);

      const hitInfo = await menuTrigger.evaluate((el, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        const style = window.getComputedStyle(el);
        const hitStyle = hit ? window.getComputedStyle(hit as Element) : null;
        return {
          menuPointerEvents: style.pointerEvents,
          menuOpacity: style.opacity,
          menuZIndex: style.zIndex,
          hitTag: hit?.tagName ?? null,
          hitId: hit instanceof HTMLElement ? hit.id : null,
          hitClass: hit instanceof HTMLElement ? hit.className : null,
          hitAriaLabel:
            hit instanceof HTMLElement ? hit.getAttribute("aria-label") : null,
          hitZIndex: hitStyle?.zIndex ?? null,
          contained: !!hit && el.contains(hit),
        };
      }, menuPoint);
      if (!hitInfo.contained) {
        throw new Error(
          `MetaControl menu trigger is not hittable at (${Math.round(menuPoint.x)},${Math.round(menuPoint.y)}).\n\nDetails:\n${JSON.stringify(hitInfo, null, 2)}`,
        );
      }

      const rightHandle = sectionNode.locator(".cursor-col-resize");
      await expect(rightHandle).toHaveCount(1);
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
      const before = await getRetainedParamResizeGeometry({
        page,
        sectionId,
        sectionNode,
      });
      const startPoint = await resolveSectionResizeStartPoint(page, sectionId);
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
    const sectionId = await createSection(page, projectConfigId, "Callable");

    try {
      await setCallable(page, projectConfigId, sectionId, "sorted");
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      const paramContainer = sectionNode.locator(
        `[id^="ParamContainer-${sectionId}-"]`,
      );
      await expect(paramContainer.first()).toBeVisible({ timeout: 20000 });
      await sectionNode.click();
      await sectionNode.hover();

      await expect
        .poll(async () => {
          const state = await loadProjectConfig(page);
          const size = getSectionSizeFromState(state, sectionId);
          return size.height;
        })
        .toBe("auto");

      const handle = sectionNode.locator(".section-resize-handle-bottom-right");
      await expect(handle).toHaveCount(1);

      const box = await handle.boundingBox();
      if (!box) {
        throw new Error("Missing resize handle bounding box.");
      }

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await handle.dispatchEvent("mousedown", {
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      });
      await handle.dispatchEvent("mousemove", {
        buttons: 1,
        clientX: startX,
        clientY: startY + 80,
      });
      await handle.dispatchEvent("mouseup", {
        button: 0,
        clientX: startX,
        clientY: startY + 80,
      });

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
      const paramContainer = sectionNode.locator(
        `[id^="ParamContainer-${sectionId}-"]`,
      );
      await expect(paramContainer.first()).toBeVisible({ timeout: 20000 });
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

      const handle = sectionNode.locator(".section-resize-handle-bottom");
      await expect(handle).toHaveCount(1);
      await sectionNode.hover();

      const handleBox = await handle.boundingBox();
      if (!handleBox) {
        throw new Error("Missing resize handle bounding box.");
      }

      const beforeBox = await sectionNode.boundingBox();
      if (!beforeBox) {
        throw new Error("Missing section bounding box.");
      }
      const beforeHeight = beforeBox.height;

      const startX = handleBox.x + handleBox.width / 2;
      const startY = handleBox.y + handleBox.height / 2;
      await handle.dispatchEvent("mousedown", {
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      });
      await page.evaluate(
        ({ startX, startY }) => {
          window.dispatchEvent(
            new MouseEvent("mouseup", {
              bubbles: true,
              clientX: startX,
              clientY: startY,
              button: 0,
            }),
          );
        },
        { startX, startY },
      );

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
    const sectionId = await createSection(page, projectConfigId, "Dict");

    let startX = 0;
    let startY = 0;

    try {
      await addKwargs(page, projectConfigId, sectionId, 40);
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await sectionNode.scrollIntoViewIfNeeded();
      await sectionNode.hover();

      const scrollContainer = sectionNode.locator(
        "div.section-args-nested.overflow-y-scroll",
      );
      await expect(scrollContainer).toHaveCount(1);

      await expect
        .poll(async () => {
          return await scrollContainer.evaluate((node) => {
            return node.scrollHeight - node.clientHeight;
          });
        })
        .toBeGreaterThan(40);

      const handle = sectionNode.locator(".section-resize-handle-right");
      await expect(handle).toHaveCount(1);
      const handleBox = await handle.boundingBox();
      if (!handleBox) {
        throw new Error("Missing resize handle bounding box.");
      }

      const beforeBox = await sectionNode.boundingBox();
      if (!beforeBox) {
        throw new Error("Missing section bounding box.");
      }
      const beforeHeight = beforeBox.height;

      startX = handleBox.x + handleBox.width / 2;
      startY = handleBox.y + handleBox.height / 2;
      await handle.dispatchEvent("mousedown", {
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      });

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

      const overflowAfter = await scrollContainer.evaluate((node) => {
        return node.scrollHeight - node.clientHeight;
      });

      await page.evaluate(
        ({ startX, startY }) => {
          window.dispatchEvent(
            new MouseEvent("mouseup", {
              bubbles: true,
              clientX: startX,
              clientY: startY,
              button: 0,
            }),
          );
        },
        { startX, startY },
      );

      expect(Math.abs(afterHeight - beforeHeight)).toBeLessThan(6);
      expect(overflowAfter).toBeGreaterThan(40);
    } finally {
      await page.evaluate(() => {
        window.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            button: 0,
          }),
        );
      });
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
    const sectionId = await createSection(page, projectConfigId, "Dict");

    let startX = 0;
    let startY = 0;

    try {
      await addKwargs(page, projectConfigId, sectionId, 40);
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await sectionNode.scrollIntoViewIfNeeded();
      await sectionNode.hover();

      const scrollContainer = sectionNode.locator(
        "div.section-args-nested.overflow-y-scroll",
      );
      await expect(scrollContainer).toHaveCount(1);

      await expect
        .poll(async () => {
          return await scrollContainer.evaluate((node) => {
            return node.scrollHeight - node.clientHeight;
          });
        })
        .toBeGreaterThan(40);

      const handle = sectionNode.locator(".section-resize-handle-bottom");
      await expect(handle).toHaveCount(1);
      const handleBox = await handle.boundingBox();
      if (!handleBox) {
        throw new Error("Missing resize handle bounding box.");
      }

      const beforeBox = await sectionNode.boundingBox();
      if (!beforeBox) {
        throw new Error("Missing section bounding box.");
      }
      const beforeHeight = beforeBox.height;

      startX = handleBox.x + handleBox.width / 2;
      startY = handleBox.y + handleBox.height / 2;
      await handle.dispatchEvent("mousedown", {
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      });

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

      const overflowAfter = await scrollContainer.evaluate((node) => {
        return node.scrollHeight - node.clientHeight;
      });

      await page.evaluate(
        ({ startX, startY }) => {
          window.dispatchEvent(
            new MouseEvent("mouseup", {
              bubbles: true,
              clientX: startX,
              clientY: startY,
              button: 0,
            }),
          );
        },
        { startX, startY },
      );

      expect(Math.abs(afterHeight - beforeHeight)).toBeLessThan(6);
      expect(overflowAfter).toBeGreaterThan(40);
    } finally {
      await page.evaluate(() => {
        window.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            button: 0,
          }),
        );
      });
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
    const sectionId = await createSection(page, projectConfigId, "Dict");

    let startX = 0;
    let startY = 0;

    try {
      await addKwargs(page, projectConfigId, sectionId, 40);
      await setSectionSizes(page, projectConfigId, {
        [sectionId]: { height: "auto" },
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await sectionNode.scrollIntoViewIfNeeded();
      await sectionNode.hover();

      const scrollContainer = sectionNode.locator(
        "div.section-args-nested.overflow-y-scroll",
      );
      await expect(scrollContainer).toHaveCount(1);

      await expect
        .poll(async () => {
          return await scrollContainer.evaluate((node) => {
            return node.scrollHeight - node.clientHeight;
          });
        })
        .toBeGreaterThan(40);

      const handle = sectionNode.locator(".section-resize-handle-bottom");
      await expect(handle).toHaveCount(1);
      const handleBox = await handle.boundingBox();
      if (!handleBox) {
        throw new Error("Missing resize handle bounding box.");
      }

      await clearResizeEvent(page, sectionId);

      startX = handleBox.x + handleBox.width / 2;
      startY = handleBox.y + handleBox.height / 2;
      await handle.dispatchEvent("mousedown", {
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      });

      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      });

      const resizeEvent = await getResizeEvent(page, sectionId);
      expect(resizeEvent).not.toBe("start");
    } finally {
      await page.evaluate(() => {
        window.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            button: 0,
          }),
        );
      });
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  },
);
