import { expect, test, type Locator, type Request } from "@playwright/test";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createCallableSection,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    sections?: Record<
      string,
      { sharedModifier?: { styleColor?: string | null } }
    >;
  };
};

function getModKey(): "Control" | "Meta" {
  return process.platform === "darwin" ? "Meta" : "Control";
}

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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

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

      const colorClassRead = await styleBlock.evaluate((block) => {
        const input = block.querySelector('input[type="color"]');
        const wrapper =
          input instanceof HTMLElement
            ? input.parentElement?.parentElement
            : null;
        return {
          wrapperClassName:
            wrapper instanceof HTMLElement ? wrapper.className : null,
          inputClassName: input instanceof HTMLElement ? input.className : null,
          blockMarkup: block.innerHTML,
        };
      });

      expect(colorClassRead.blockMarkup).not.toContain("single-cell-container");
      expect(colorClassRead.blockMarkup).not.toContain("single-cell-child");
      expect(colorClassRead.wrapperClassName).not.toContain(
        "single-cell-container",
      );
      expect(colorClassRead.inputClassName).not.toContain("single-cell-child");

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
      await page.waitForSelector(".react-flow__pane");

      const nodeAfter = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(nodeAfter).toBeVisible();
      await nodeAfter.click();

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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

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
      );
      await postBackend(page, "/setCallable", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      const sectionChrome = node
        .locator(`section[data-section-id="${sectionId}"]`)
        .first();
      await expect(sectionChrome).toBeVisible();
      // Click directly on the section chrome so the section selection handler runs,
      // instead of landing on nested inputs that may stop click propagation.
      await sectionChrome.dispatchEvent("click");

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const styleBlock = await getStyleBlock(uiEditorPane);

      const argsStrip = sectionChrome.locator(".section-args").first();
      await expect(argsStrip).toBeVisible();
      const firstParamRow = sectionChrome
        .locator(`[id^="ParamContainer-${sectionId}-"]`)
        .first();
      await expect(firstParamRow).toBeVisible({ timeout: 20000 });
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

      await firstParamRow.hover();
      await expect
        .poll(async () => {
          return await firstParamRow.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
          });
        })
        .toBe("rgb(166, 255, 166)");
      await expect.poll(getArgsBackgroundColor).toBe("rgb(224, 255, 224)");

      const modKey = getModKey();
      await page.keyboard.down(modKey);
      await page.keyboard.down("Shift");
      await firstParamRow.click();
      await page.keyboard.up("Shift");
      await page.keyboard.up(modKey);
      await expect
        .poll(async () => {
          return await firstParamRow.evaluate((el) => {
            const rowStyle = window.getComputedStyle(el);
            const sampleText = el.querySelector(
              ".section-key, .section-value, span",
            );
            const textColor = sampleText
              ? window.getComputedStyle(sampleText).color
              : rowStyle.color;
            return {
              backgroundColor: rowStyle.backgroundColor,
              textColor,
            };
          });
        })
        .toMatchObject({
          backgroundColor: "rgb(89, 255, 89)",
          textColor: "rgb(0, 0, 0)",
        });

      const firstParamRowId = await firstParamRow.getAttribute("id");
      const pinnedParamId = firstParamRowId?.replace(
        `ParamContainer-${sectionId}-`,
        "",
      );
      if (!pinnedParamId || pinnedParamId === firstParamRowId) {
        throw new Error("Unable to parse first selected param id.");
      }

      await postBackend(page, "/setSectionPinnedParams", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        pinnedParams: [pinnedParamId],
      });
      await expect(sectionChrome.getByText("Pinned Params")).toBeVisible({
        timeout: 20000,
      });

      const paramIdPrefix = `ParamContainer-${sectionId}-`;
      const paramIds = await sectionChrome
        .locator(`[id^="${paramIdPrefix}"]`)
        .evaluateAll(
          (nodes, prefix) =>
            nodes
              .map((node) => node.id)
              .filter((id) => id.startsWith(prefix))
              .map((id) => id.slice(prefix.length)),
          paramIdPrefix,
        );
      const edgeParamId = paramIds.find((id) => id !== pinnedParamId) ?? null;
      if (!edgeParamId) {
        throw new Error(
          "Expected at least one additional param for edge strip assertions.",
        );
      }

      await postBackend(page, "/setSectionEdgeInputs", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        edgeInputParams: [edgeParamId],
      });

      const pinnedHeading = sectionChrome.getByText("Pinned Params").first();
      await expect(pinnedHeading).toBeVisible();
      await expect
        .poll(async () => {
          return await pinnedHeading.evaluate((el) => {
            const pinnedArea = el.closest(`section[data-params-fixed="true"]`);
            if (!(pinnedArea instanceof HTMLElement)) {
              return null;
            }
            return window.getComputedStyle(pinnedArea).backgroundColor;
          });
        })
        .toBe("rgb(204, 255, 204)");

      const edgeRow = sectionChrome.locator(
        `[data-edge-param-id="${edgeParamId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible();
      await expect
        .poll(async () => {
          return await edgeRow.evaluate((el) => {
            const strip = el.closest(`section[data-params-fixed="true"]`);
            if (!(strip instanceof HTMLElement)) {
              return null;
            }
            return window.getComputedStyle(strip).backgroundColor;
          });
        })
        .toBe("rgb(204, 255, 204)");

      const argEdgeHandle = page.locator(
        `.react-flow__handle.arg-edge-handle[data-nodeid="${sectionId}"][data-handleid="${edgeParamId}"]`,
      );
      await expect(argEdgeHandle).toBeVisible();
      await expect(argEdgeHandle).toHaveCSS(
        "background-color",
        "rgb(166, 255, 166)",
      );
      await argEdgeHandle.hover();
      await expect(argEdgeHandle).toHaveCSS(
        "background-color",
        "rgb(89, 255, 89)",
      );
      const argEdgeHandleBox = await argEdgeHandle.boundingBox();
      if (!argEdgeHandleBox) {
        throw new Error("Missing arg edge handle bounding box.");
      }
      await page.mouse.move(
        argEdgeHandleBox.x + argEdgeHandleBox.width / 2,
        argEdgeHandleBox.y + argEdgeHandleBox.height / 2,
      );
      await page.mouse.down();
      await expect(argEdgeHandle).toHaveCSS(
        "background-color",
        "rgb(166, 255, 166)",
      );
      await page.mouse.up();

      await sectionChrome.hover();
      const agenticTargetHandle = page.locator(
        `.react-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );
      const agenticSourceHandle = page.locator(
        `.react-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

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
