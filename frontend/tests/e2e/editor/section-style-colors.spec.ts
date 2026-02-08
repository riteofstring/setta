import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
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

      const styleBlock = uiEditorPane
        .locator("div.rounded-xl")
        .filter({
          has: page.getByRole("heading", { name: "Style" }),
        })
        .first();
      await expect(styleBlock).toBeVisible();

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
      await page.waitForSelector(".react-flow__pane");

      const nodeAfter = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(nodeAfter).toBeVisible();
      await nodeAfter.click();

      const uiEditorAfter = page.locator("#UiEditorPane");
      await expect(uiEditorAfter).toBeVisible();
      const styleBlockAfter = uiEditorAfter
        .locator("div.rounded-xl")
        .filter({
          has: page.getByRole("heading", { name: "Style" }),
        })
        .first();
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

      await styleBlockAfter.getByRole("button", { name: "Reset" }).click();

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

  test("does not tint the args controls strip background", async ({ page }) => {
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
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

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

      const styleBlock = uiEditorPane
        .locator("div.rounded-xl")
        .filter({
          has: page.getByRole("heading", { name: "Style" }),
        })
        .first();
      await expect(styleBlock).toBeVisible();

      const argsStrip = sectionChrome.locator(".section-args").first();
      await expect(argsStrip).toBeVisible();

      const getArgsBackgroundColor = async () => {
        return await argsStrip.evaluate((el) => {
          return window.getComputedStyle(el).backgroundColor;
        });
      };
      const getSectionChromeAndArgsStyles = async () => {
        return await sectionChrome.evaluate((el) => {
          const sectionStyle = window.getComputedStyle(el);
          const args = el.querySelector(".section-args");
          const argsStyle = args ? window.getComputedStyle(args) : null;
          const argsIconButton = args?.querySelector("button");
          const argsIconStyle = argsIconButton
            ? window.getComputedStyle(argsIconButton)
            : null;
          return {
            outlineColor: sectionStyle.outlineColor,
            argsBorderColor: argsStyle?.borderBottomColor ?? null,
            argsBackgroundColor: argsStyle?.backgroundColor ?? null,
            argsIconColor: argsIconStyle?.color ?? null,
          };
        });
      };

      expect(await getArgsBackgroundColor()).toBe("rgba(0, 0, 0, 0)");

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
      await expect.poll(getArgsBackgroundColor).toBe("rgba(0, 0, 0, 0)");
      await expect
        .poll(async () => await getSectionChromeAndArgsStyles())
        .toMatchObject({
          outlineColor: "rgb(89, 255, 89)",
          argsBorderColor: "rgb(166, 255, 166)",
          argsBackgroundColor: "rgba(0, 0, 0, 0)",
          argsIconColor: "rgb(123, 140, 123)",
        });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
