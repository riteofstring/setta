import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const proofUrl = "/?adapter-proof";

async function expectSelectionAligned(page: Page) {
  const section = page.locator('[data-proof-section-id="nested-note-b"]');
  const overlay = page.locator(".setta-adapter-proof__selection-overlay");
  await expect(section).toBeVisible();
  await expect(overlay).toBeVisible();
  await expect
    .poll(async () => {
      const sectionBox = await section.boundingBox();
      const overlayBox = await overlay.boundingBox();
      if (!sectionBox || !overlayBox) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.max(
        Math.abs(sectionBox.x - overlayBox.x),
        Math.abs(sectionBox.y - overlayBox.y),
        Math.abs(sectionBox.width - overlayBox.width),
        Math.abs(sectionBox.height - overlayBox.height),
      );
    })
    .toBeLessThanOrEqual(2);
}

test.describe("upstream adapter proof", () => {
  test("shares transformed geometry across nested selection, focus, resize, and scrolling", async ({
    page,
  }) => {
    await page.goto(proofUrl);

    await expect(page.locator("[data-proof-geometry-count]")).toContainText("Frames: 8");
    await expectSelectionAligned(page);

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expectSelectionAligned(page);

    const selectedSection = page.locator('[data-proof-section-id="nested-note-b"]');
    const beforeWidth = await selectedSection.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    await selectedSection.getByRole("button", { name: "Widen section" }).click();
    await expect
      .poll(() => selectedSection.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(beforeWidth);
    await expectSelectionAligned(page);

    const pageScrollBeforeFocus = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: "Focus selected" }).click();
    await expect(selectedSection.getByRole("button", { name: "Decision note" })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBeforeFocus);
    await expectSelectionAligned(page);

    const nestedScroller = page
      .locator('[data-proof-section-id="root-alpha"]')
      .locator(".setta-adapter-proof__nested-scroll");
    await nestedScroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const viewportTransform = page.locator(".react-flow__viewport");
    const transformBeforeScroll = await viewportTransform.getAttribute("style");
    await nestedScroller.hover();
    await page.mouse.wheel(0, 240);
    await expect
      .poll(() => nestedScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await viewportTransform.getAttribute("style")).toBe(transformBeforeScroll);
  });

  test("keeps one movement owner and emits one command only on accepted completion", async ({
    page,
  }) => {
    await page.goto(proofUrl);
    const commandCount = page.locator("[data-proof-command-count]");
    const packageStatus = page.locator('.setta-adapter-proof__summary [role="status"]');
    const planningRoot = page.locator('.react-flow__node[data-id="root-alpha"]');
    await expect(commandCount).toHaveText("Commands: 0");
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("0");

    const cancelHandle = page.getByRole("button", { name: "Move Horizontal container" });
    await cancelHandle.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("1000");
    await page.keyboard.press("Escape");
    await expect(packageStatus).toContainText("canceled without a command");
    await expect(cancelHandle).toHaveAttribute("aria-grabbed", "false");
    await expect(commandCount).toHaveText("Commands: 0");
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("0");

    const sourceHandle = page.getByRole("button", { name: "Move Research note" });
    await sourceHandle.scrollIntoViewIfNeeded();
    const target = page.locator('[data-proof-section-id="nested-container"]');
    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) {
      throw new Error("The nested reorder proof controls must be measurable.");
    }
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      sourceBox.x + sourceBox.width / 2 + 8,
      sourceBox.y + sourceBox.height / 2,
      {
        steps: 4,
      },
    );
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("1000");
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 24, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(commandCount).toHaveText("Commands: 1");
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("0");
    await expect(packageStatus).toContainText("one package command emitted");
    await expect
      .poll(() =>
        page
          .locator(
            '[data-proof-section-id="root-alpha"] .setta-adapter-proof__nested-scroll > [data-proof-section-id]',
          )
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-proof-section-id")),
          ),
      )
      .toEqual(["nested-container", "nested-note-a", "nested-note-d"]);

    const rootHandle = page.getByRole("button", { name: "Move Planning section" });
    const rootHandleBox = await rootHandle.boundingBox();
    if (!rootHandleBox) {
      throw new Error("The root movement handle must be measurable.");
    }
    await page.mouse.move(
      rootHandleBox.x + rootHandleBox.width / 2,
      rootHandleBox.y + rootHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rootHandleBox.x + rootHandleBox.width / 2 + 64,
      rootHandleBox.y + rootHandleBox.height / 2 + 36,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect(commandCount).toHaveText("Commands: 2");
  });

  test("has accessible semantics, reflows, and matches its visual baseline", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(proofUrl);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await expect(page).toHaveScreenshot("upstream-adapter-proof.png", {
      animations: "disabled",
      fullPage: true,
    });

    await page.setViewportSize({ width: 320, height: 720 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
