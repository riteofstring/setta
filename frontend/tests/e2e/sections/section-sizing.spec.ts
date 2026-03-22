import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  loadProjectConfig,
  openIsolatedProject,
  type ProjectStateSingleConfigResponse,
  postBackend,
  refreshProjectStateFromBackend,
} from "../helpers";

async function createSection(
  page: Page,
  projectConfigId: string,
  implType: string,
) {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
    },
  );
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId for ${implType} creation.`);
  }
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  await postBackend(page, "/moveSections", {
    projectConfigId,
    sectionIds: [response.sectionId],
    newParentId: null,
    newIndex: null,
    positionsById: {
      [response.sectionId]: {
        x: viewportBounds.x + viewportBounds.w * 0.35,
        y: viewportBounds.y + viewportBounds.h * 0.35,
      },
    },
  });
  await refreshProjectStateFromBackend(page, projectConfigId);
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
    projectState?: ProjectStateSingleConfigResponse | null;
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
  await postBackend(page, "/setSectionSizes", {
    projectConfigId,
    sectionSizes: normalizedSectionSizes,
  });
  await refreshProjectStateFromBackend(page, projectConfigId);
}

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
) {
  await postBackend(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams: true,
  });
  await refreshProjectStateFromBackend(page, projectConfigId);
}

async function addKwargs(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  count: number,
) {
  for (let i = 0; i < count; i += 1) {
    await postBackend(page, "/addKwarg", {
      projectConfigId,
      sectionId,
    });
  }
  await refreshProjectStateFromBackend(page, projectConfigId);
}

function getSectionSizeFromState(
  state: ProjectStateSingleConfigResponse,
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

isolatedSizingTest("chart resize clamps to min and persists size", async (
  page,
  projectConfigId,
) => {
  const sectionId = await createSection(page, projectConfigId, "Chart");

  try {
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    const handle = sectionNode.locator(
      ".section-resize-handle-bottom-right",
    );
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
});

isolatedSizingTest("meta control slider only shows width resize handle", async (
  page,
  projectConfigId,
) => {
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

    const hitInfo = await menuTrigger.evaluate(
      (el, point) => {
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
      },
      menuPoint,
    );
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
});

isolatedSizingTest("setSectionSizes updates node dimensions", async (
  page,
  projectConfigId,
) => {
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
});

isolatedSizingTest("callable resize exits auto height cap", async (
  page,
  projectConfigId,
) => {
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

    const handle = sectionNode.locator(
      ".section-resize-handle-bottom-right",
    );
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
});

isolatedSizingTest("resize start does not jump at zoom", async (
  page,
  projectConfigId,
) => {
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
            return typeof window.reactFlowZoom === "number";
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
            return typeof window.reactFlowZoom === "number"
              ? window.reactFlowZoom
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
});

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
