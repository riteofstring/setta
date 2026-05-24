import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createCallableSection,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setCallableFromFrontend,
  setSectionEdgeInputsFromFrontend,
  setSectionPinnedParamsFromFrontend,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    sections?: Record<
      string,
      { sharedModifier?: { styleColor?: string | null } }
    >;
  };
};

type ParamListKey = "pinned" | "unpinned";
type RetainedParamRowDebug = {
  labelClientPoint: { x: number; y: number };
  rowId: string;
  rowState: {
    selected?: boolean;
  };
  surfaceId: string;
};

async function ensureAppearanceAccordionExpanded(
  uiEditorPane: Locator,
): Promise<void> {
  const appearanceAccordionTrigger = uiEditorPane.getByTestId(
    "section-config-accordion-appearance",
  );
  await expect(appearanceAccordionTrigger).toBeVisible();
  if (
    (await appearanceAccordionTrigger.getAttribute("aria-expanded")) !== "true"
  ) {
    await appearanceAccordionTrigger.evaluate((element: HTMLButtonElement) =>
      element.click(),
    );
  }
  await expect(appearanceAccordionTrigger).toHaveAttribute(
    "aria-expanded",
    "true",
  );
}

async function getStyleBlock(uiEditorPane: Locator): Promise<Locator> {
  await ensureAppearanceAccordionExpanded(uiEditorPane);
  const styleHeading = uiEditorPane.getByText("Style", { exact: true });
  await expect(styleHeading).toBeVisible();
  const styleBlock = styleHeading.locator(
    "xpath=ancestor::div[contains(@class,'rounded-lg') or contains(@class,'rounded-xl')][1]",
  );
  await expect(styleBlock).toBeVisible();
  return styleBlock;
}

function paramSurfaceId(sectionId: string, listKey: ParamListKey): string {
  return `${sectionId}:param-content:${listKey}`;
}

async function readShownParamIds(
  page: Page,
  sectionId: string,
): Promise<{ pinned: string[]; unpinned: string[] }> {
  return await page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const variantId = state.projectConfig.sectionVariantMap[targetSectionId];
    const shown = variantId ? state.shownParamIds[variantId] : null;
    return {
      pinned: shown?.pinned.topLevelParamIds ?? [],
      unpinned: shown?.unpinned.topLevelParamIds ?? [],
    };
  }, sectionId);
}

async function waitForFirstShownParamId(
  page: Page,
  sectionId: string,
): Promise<string> {
  await expect
    .poll(async () => {
      const shown = await readShownParamIds(page, sectionId);
      return shown.unpinned[0] ?? shown.pinned[0] ?? null;
    })
    .not.toBeNull();
  const shown = await readShownParamIds(page, sectionId);
  const firstParamId = shown.unpinned[0] ?? shown.pinned[0] ?? null;
  if (!firstParamId) {
    throw new Error(`Missing retained param row for ${sectionId}.`);
  }
  return firstParamId;
}

async function readRetainedParamRows(
  page: Page,
  sectionId: string,
  listKey: ParamListKey,
): Promise<RetainedParamRowDebug[]> {
  const surfaceId = paramSurfaceId(sectionId, listKey);
  return await page.evaluate((targetSurfaceId) => {
    return (
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
    ).filter((row) => row.surfaceId === targetSurfaceId);
  }, surfaceId);
}

async function readRetainedParamRow(
  page: Page,
  sectionId: string,
  listKey: ParamListKey,
  rowId: string,
): Promise<RetainedParamRowDebug | null> {
  const rows = await readRetainedParamRows(page, sectionId, listKey);
  return rows.find((row) => row.rowId === rowId) ?? null;
}

async function hoverRetainedParamRow(
  page: Page,
  sectionId: string,
  listKey: ParamListKey,
  rowId: string,
): Promise<void> {
  const row = await readRetainedParamRow(page, sectionId, listKey, rowId);
  if (!row) {
    throw new Error(`Missing retained param row ${rowId}.`);
  }
  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y, {
    steps: 4,
  });
}

async function readHoveredRetainedRowTarget(page: Page): Promise<{
  rowId: string;
  surfaceId: string;
} | null> {
  return await page.evaluate(() => {
    const hit = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().hoveredRetainedHit;
    return hit ? { rowId: hit.rowId, surfaceId: hit.surfaceId } : null;
  });
}

async function readSectionPortAnchorsForTest(
  page: Page,
  sectionId: string,
): Promise<Array<{ id: string; kind: string }>> {
  return await page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const { getProjectGpuFlowScene } = await import(
      "/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts"
    );
    const state = useProjectState.getState();
    const scene = getProjectGpuFlowScene(state, {
      darkMode: false,
    });
    const section = scene.sections.find(
      (candidate) => candidate.sectionId === targetSectionId,
    );
    return (
      section?.portAnchors.map((anchor) => ({
        id: anchor.id,
        kind: anchor.kind,
      })) ?? []
    );
  }, sectionId);
}

async function toggleParamSelectedForTest(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<void> {
  await page.evaluate(
    async ({ targetParamInfoId, targetSectionId }) => {
      const { toggleParamSelected } = await import(
        "/src/state/actions/sectionInfos/viewportUpdates.ts"
      );
      toggleParamSelected(targetSectionId, targetParamInfoId);
    },
    { targetParamInfoId: paramInfoId, targetSectionId: sectionId },
  );
}

test.describe.serial("section style colors", () => {
  test("sets style color via Section Config and themes section chrome", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_style_color__",
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const styleBlock = await getStyleBlock(uiEditorPane);

      const sectionChrome = node
        .locator(`section[data-section-id="${sectionId}"]`)
        .first();
      await expect(sectionChrome).toBeVisible();

      const getChromeStyles = async () => {
        return await sectionChrome.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
          };
        });
      };

      const baselineStyles = await getChromeStyles();
      // Regression guard: without a custom style, section chrome should not become transparent
      // just because the CSS vars are unset.
      expect(baselineStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

      const colorInput = styleBlock.locator('input[type="color"]').first();
      await expect(colorInput).toBeVisible();
      await colorInput.evaluate((el: HTMLInputElement, value: string) => {
        // React tracks input values using the native setter; use it so onChange fires reliably.
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, "#ff0000");

      await expect(styleBlock.getByText("#ff0000").first()).toBeVisible();

      await expect
        .poll(async () => await getChromeStyles())
        .toMatchObject({
          backgroundColor: "rgb(255, 224, 224)",
          borderColor: "rgb(255, 166, 166)",
        });

      expect(baselineStyles.backgroundColor).not.toBe("rgb(255, 224, 224)");
      expect(baselineStyles.borderColor).not.toBe("rgb(255, 166, 166)");

      await expect
        .poll(
          async () => {
            const response = await postBackend<LatestProjectStateResponse>(
              page,
              "/getLatestProjectState",
              { projectConfigId: projectContext.projectConfigId },
            );
            return (
              response?.projectState?.sections?.[sectionId]?.sharedModifier
                ?.styleColor ?? null
            );
          },
          { timeout: 8000 },
        )
        .toBe("#ff0000");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".setta-gpu-flow__pane");

      const nodeAfter = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(nodeAfter).toBeVisible();
      await activateSectionForEditor(page, sectionId);

      const uiEditorAfter = page.locator("#UiEditorPane");
      await expect(uiEditorAfter).toBeVisible();
      const styleBlockAfter = await getStyleBlock(uiEditorAfter);
      await expect(styleBlockAfter.getByText("#ff0000").first()).toBeVisible();

      const sectionChromeAfter = nodeAfter
        .locator(`section[data-section-id="${sectionId}"]`)
        .first();
      await expect(sectionChromeAfter).toBeVisible();
      await expect
        .poll(async () => {
          return await sectionChromeAfter.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return {
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
            };
          });
        })
        .toMatchObject({
          backgroundColor: "rgb(255, 224, 224)",
          borderColor: "rgb(255, 166, 166)",
        });

      await styleBlockAfter
        .getByRole("button", { name: "Reset" })
        .evaluate((element: HTMLButtonElement) => element.click());

      await expect(styleBlockAfter.getByText("None").first()).toBeVisible();
      await expect
        .poll(async () => {
          const style = await sectionChromeAfter.evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
              backgroundColor: computed.backgroundColor,
              borderColor: computed.borderColor,
            };
          });
          return style;
        })
        .toMatchObject(baselineStyles);

      await expect
        .poll(
          async () => {
            const response = await postBackend<LatestProjectStateResponse>(
              page,
              "/getLatestProjectState",
              { projectConfigId: projectContext.projectConfigId },
            );
            return (
              response?.projectState?.sections?.[sectionId]?.sharedModifier
                ?.styleColor ?? null
            );
          },
          { timeout: 8000 },
        )
        .toBeNull();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("updates the minimap swatch when section style color changes without geometry changes", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
      showMinimap: true,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_style_minimap__",
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      const styleBlock = await getStyleBlock(uiEditorPane);

      const sectionChrome = node
        .locator(`section[data-section-id="${sectionId}"]`)
        .first();
      await expect(sectionChrome).toBeVisible();

      const minimapNode = page
        .locator(
          `[data-testid="rf__minimap"] [data-minimap-node-id="${sectionId}"]`,
        )
        .first();
      await expect(minimapNode).toBeVisible();

      const baselineFill = await minimapNode.evaluate(
        (element) => window.getComputedStyle(element).fill,
      );

      const colorInput = styleBlock.locator('input[type="color"]').first();
      await expect(colorInput).toBeVisible();
      await colorInput.evaluate((el: HTMLInputElement, value: string) => {
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, "#ff0000");

      await expect
        .poll(async () => {
          return await sectionChrome.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
          });
        })
        .toBe("rgb(255, 224, 224)");

      await expect
        .poll(async () => {
          return await minimapNode.evaluate((element) => {
            return window.getComputedStyle(element).fill;
          });
        })
        .toBe("rgb(255, 224, 224)");

      expect(baselineFill).not.toBe("rgb(255, 224, 224)");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("tints args strip, panels, connectors, and param states", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Callable: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
        { position: { x: 220, y: 160 } },
      );
      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      const sectionChrome = node
        .locator(`section[data-section-id="${sectionId}"]`)
        .first();
      await expect(sectionChrome).toBeVisible();
      await sectionChrome.dispatchEvent("click");
      await activateSectionForEditor(page, sectionId);

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const styleBlock = await getStyleBlock(uiEditorPane);

      const argsStrip = sectionChrome.locator(".section-args").first();
      await expect(argsStrip).toBeVisible();
      const firstParamId = await waitForFirstShownParamId(page, sectionId);
      await expect
        .poll(async () => {
          const rows = await readRetainedParamRows(page, sectionId, "unpinned");
          return rows.some((row) => row.rowId === firstParamId);
        })
        .toBe(true);
      const callableSearch = sectionChrome.locator(
        `[id="${sectionId}-search"]`,
      );
      await expect(callableSearch).toBeVisible();

      const getArgsBackgroundColor = async () => {
        return await argsStrip.evaluate((el) => {
          return window.getComputedStyle(el).backgroundColor;
        });
      };
      const getCallableInputBorderColor = async () => {
        return await callableSearch.evaluate((searchEl) => {
          const allElements = [
            searchEl,
            ...Array.from(searchEl.querySelectorAll<HTMLElement>("*")),
          ];
          const borderedCandidates = allElements
            .map((candidate) => {
              const style = window.getComputedStyle(candidate);
              const rect = candidate.getBoundingClientRect();
              const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0;
              const borderWidth = Number.parseFloat(style.borderTopWidth);
              const hasVisibleBorder =
                borderWidth > 0 &&
                style.borderTopStyle !== "none" &&
                style.borderTopColor !== "rgba(0, 0, 0, 0)";
              return {
                candidate,
                visible,
                hasVisibleBorder,
                area: rect.width * rect.height,
              };
            })
            .filter((entry) => entry.visible && entry.hasVisibleBorder)
            .sort((a, b) => b.area - a.area);
          const target = borderedCandidates[0]?.candidate ?? null;
          if (!target) {
            return null;
          }
          return window.getComputedStyle(target).borderTopColor;
        });
      };
      const getSectionChromeAndArgsStyles = async () => {
        return await sectionChrome.evaluate((el) => {
          const sectionStyle = window.getComputedStyle(el);
          const args = el.querySelector(".section-args");
          const argsStyle = args ? window.getComputedStyle(args) : null;
          const argsIconButton = args?.querySelector("button");
          const argsIconGlyph = args?.querySelector("button i");
          const argsIconStyle = argsIconButton
            ? window.getComputedStyle(argsIconButton)
            : null;
          const argsIconGlyphStyle = argsIconGlyph
            ? window.getComputedStyle(argsIconGlyph)
            : null;
          return {
            outlineColor: sectionStyle.outlineColor,
            sectionBackgroundColor: sectionStyle.backgroundColor,
            argsBorderColor: argsStyle?.borderBottomColor ?? null,
            argsBackgroundColor: argsStyle?.backgroundColor ?? null,
            argsOverflowX: argsStyle?.overflowX ?? null,
            argsOverflowY: argsStyle?.overflowY ?? null,
            argsIconColor: argsIconStyle?.color ?? null,
            argsIconGlyphColor: argsIconGlyphStyle?.color ?? null,
          };
        });
      };

      await expect
        .poll(async () => await getSectionChromeAndArgsStyles())
        .toMatchObject({
          argsBackgroundColor: "rgb(239, 241, 246)",
          argsOverflowX: "hidden",
          argsOverflowY: "hidden",
        });
      const baselineSectionChromeAndArgsStyles =
        await getSectionChromeAndArgsStyles();
      expect(baselineSectionChromeAndArgsStyles.argsBackgroundColor).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(baselineSectionChromeAndArgsStyles.argsBackgroundColor).not.toBe(
        baselineSectionChromeAndArgsStyles.sectionBackgroundColor,
      );
      expect(await getCallableInputBorderColor()).not.toBeNull();

      const colorInput = styleBlock.locator('input[type="color"]').first();
      await expect(colorInput).toBeVisible();
      await colorInput.evaluate((el: HTMLInputElement, value: string) => {
        // React tracks input values using the native setter; use it so onChange fires reliably.
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, "#00ff00");

      await expect(styleBlock.getByText("#00ff00").first()).toBeVisible();
      await expect.poll(getArgsBackgroundColor).toBe("rgb(224, 255, 224)");
      await expect
        .poll(async () => await getSectionChromeAndArgsStyles())
        .toMatchObject({
          outlineColor: "rgb(89, 255, 89)",
          sectionBackgroundColor: "rgb(224, 255, 224)",
          argsBorderColor: "rgb(166, 255, 166)",
          argsBackgroundColor: "rgb(224, 255, 224)",
          argsOverflowX: "hidden",
          argsOverflowY: "hidden",
          argsIconColor: "rgb(123, 140, 123)",
          argsIconGlyphColor: "rgb(123, 140, 123)",
        });
      await expect.poll(getCallableInputBorderColor).toBe("rgb(166, 255, 166)");

      await hoverRetainedParamRow(page, sectionId, "unpinned", firstParamId);
      await expect
        .poll(async () => {
          return await readHoveredRetainedRowTarget(page);
        })
        .toEqual({
          rowId: firstParamId,
          surfaceId: paramSurfaceId(sectionId, "unpinned"),
        });
      await expect.poll(getArgsBackgroundColor).toBe("rgb(224, 255, 224)");

      await toggleParamSelectedForTest(page, sectionId, firstParamId);
      await expect
        .poll(async () => {
          return (
            await readRetainedParamRow(page, sectionId, "unpinned", firstParamId)
          )?.rowState.selected;
        })
        .toBe(true);

      await setSectionPinnedParamsFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        pinnedParams: [firstParamId],
      });
      await expect
        .poll(async () => {
          const rows = await readRetainedParamRows(page, sectionId, "pinned");
          return rows.some((row) => row.rowId === firstParamId);
        })
        .toBe(true);

      const shownParamIds = await readShownParamIds(page, sectionId);
      const paramIds = [...shownParamIds.pinned, ...shownParamIds.unpinned];
      const edgeParamId = paramIds.find((id) => id !== firstParamId) ?? null;
      if (!edgeParamId) {
        throw new Error(
          "Expected at least one additional param for edge strip assertions.",
        );
      }

      await setSectionEdgeInputsFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        edgeInputParams: [edgeParamId],
      });
      await expect
        .poll(async () => {
          const anchors = await readSectionPortAnchorsForTest(page, sectionId);
          return anchors.some(
            (anchor) => anchor.id === edgeParamId && anchor.kind === "input",
          );
        })
        .toBe(true);

      const argEdgeHandle = sectionChrome.locator(
        ".arg-edge-handle.arg-edge-handle--target",
      );
      await expect(argEdgeHandle).toBeVisible();
      await expect(argEdgeHandle).toHaveCSS(
        "background-color",
        "rgb(166, 255, 166)",
      );

      await node.evaluate((element) => {
        element.setAttribute("data-gpu-flow-hovered", "true");
      });
      const agenticTargetHandle = page.locator(
        `.setta-gpu-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );
      const agenticSourceHandle = page.locator(
        `.setta-gpu-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      await expect(agenticTargetHandle).toHaveCSS(
        "border-color",
        "rgb(89, 255, 89)",
      );
      await expect(agenticSourceHandle).toHaveCSS(
        "background-color",
        "rgb(89, 255, 89)",
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("commits section style color once after color-drag preview", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_style_drag__",
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      const styleBlock = await getStyleBlock(uiEditorPane);

      const colorInput = styleBlock.locator('input[type="color"]').first();
      await expect(colorInput).toBeVisible();
      const sectionChrome = node
        .locator(`section[data-section-id="${sectionId}"]`)
        .first();
      await expect(sectionChrome).toBeVisible();
      const getChromeStyles = async () => {
        return await sectionChrome.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
          };
        });
      };
      const baselineStyles = await getChromeStyles();

      let styleColorRequestCount = 0;
      const onRequest = (request: Request) => {
        if (
          request.method() === "POST" &&
          request.url().includes("/api/setSectionStyleColor")
        ) {
          styleColorRequestCount += 1;
        }
      };
      page.on("request", onRequest);

      const draggedColors = [
        "#ff0000",
        "#ff3300",
        "#ff6600",
        "#ff9900",
        "#ffcc00",
        "#ffff00",
        "#ccff00",
        "#99ff00",
        "#66ff00",
        "#33ff00",
        "#00ff00",
        "#00ff33",
        "#00ff66",
        "#00ff99",
        "#00ffcc",
        "#00ffff",
      ];
      const previewColor = "#00ffff";
      const finalColor = "#22cc88";

      await colorInput.evaluate((el: HTMLInputElement, colors: string[]) => {
        // React tracks input values using the native setter; use it so onInput fires reliably.
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        for (const color of colors) {
          descriptor?.set?.call(el, color);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, draggedColors);

      await expect(styleBlock.getByText(previewColor).first()).toBeVisible();
      await expect.poll(() => styleColorRequestCount).toBe(0);
      await expect.poll(getChromeStyles).toMatchObject({
        backgroundColor: "rgb(224, 255, 255)",
        borderColor: "rgb(166, 255, 255)",
      });
      expect(baselineStyles.backgroundColor).not.toBe("rgb(224, 255, 255)");

      await expect
        .poll(
          async () => {
            const response = await postBackend<LatestProjectStateResponse>(
              page,
              "/getLatestProjectState",
              { projectConfigId: projectContext.projectConfigId },
            );
            return (
              response?.projectState?.sections?.[sectionId]?.sharedModifier
                ?.styleColor ?? null
            );
          },
          { timeout: 8000 },
        )
        .toBeNull();

      await colorInput.evaluate((el: HTMLInputElement, color: string) => {
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(el, color);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, finalColor);

      await expect(styleBlock.getByText(finalColor).first()).toBeVisible();
      await expect.poll(() => styleColorRequestCount).toBe(1);
      await expect
        .poll(
          async () => {
            const response = await postBackend<LatestProjectStateResponse>(
              page,
              "/getLatestProjectState",
              { projectConfigId: projectContext.projectConfigId },
            );
            return (
              response?.projectState?.sections?.[sectionId]?.sharedModifier
                ?.styleColor ?? null
            );
          },
          { timeout: 8000 },
        )
        .toBe(finalColor);

      page.off("request", onRequest);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function activateSectionForEditor(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections"
    );
    setActiveSectionIds([id], { syncMode: "ui-only" });
  }, sectionId);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { getActiveSectionUIIds } = await import(
          "/src/state/activeSectionUI"
        );
        return getActiveSectionUIIds();
      }),
    )
    .toEqual([sectionId]);
}
