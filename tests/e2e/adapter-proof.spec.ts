import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const proofUrl = "/?adapter-proof";

async function expectSelectionAligned(page: Page, sectionIds = ["nested-note-b"]) {
  const sections = sectionIds.map((sectionId) =>
    page.locator(`[data-proof-section-id="${sectionId}"]`),
  );
  const overlay = page.locator(".setta-adapter-proof__selection-overlay");
  for (const section of sections) {
    await expect(section).toBeAttached();
  }
  await expect(overlay).toBeVisible();
  await expect
    .poll(async () => {
      const sectionBoxes = await Promise.all(sections.map((section) => section.boundingBox()));
      const overlayBox = await overlay.boundingBox();
      if (sectionBoxes.some((box) => !box) || !overlayBox) {
        return Number.POSITIVE_INFINITY;
      }
      const measuredBoxes = sectionBoxes.filter((box) => box !== null);
      const left = Math.min(...measuredBoxes.map((box) => box.x));
      const top = Math.min(...measuredBoxes.map((box) => box.y));
      const right = Math.max(...measuredBoxes.map((box) => box.x + box.width));
      const bottom = Math.max(...measuredBoxes.map((box) => box.y + box.height));
      return Math.max(
        Math.abs(left - overlayBox.x),
        Math.abs(top - overlayBox.y),
        Math.abs(right - (overlayBox.x + overlayBox.width)),
        Math.abs(bottom - (overlayBox.y + overlayBox.height)),
      );
    })
    .toBeLessThanOrEqual(2);
}

async function dragMarquee(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width, box.y + box.height, { steps: 8 });
  await expect(page.locator("[data-proof-marquee]")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Shift");
}

test.describe("upstream adapter proof", () => {
  test("shares transformed geometry across nested selection, focus, resize, and scrolling", async ({
    page,
  }) => {
    await page.goto(proofUrl);

    await expect(page.locator("[data-proof-geometry-count]")).toContainText("Frames: 8");
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
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

  test("uses all-depth geometry for marquee, normalized multi-selection, and every proof zoom", async ({
    page,
  }) => {
    await page.goto(proofUrl);
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");

    await page.getByRole("button", { name: "Select deep notes" }).click();
    await expect(page.locator("[data-proof-selection-ids]")).toContainText(
      "nested-note-b, nested-note-c",
    );
    await expect(page.locator(".setta-adapter-proof__selection-overlay")).toHaveAttribute(
      "data-proof-selection-roots",
      "nested-note-b,nested-note-c",
    );

    for (const zoomPercent of [50, 100, 200]) {
      const zoomControl = page.getByRole("button", { name: `Set zoom to ${zoomPercent}%` });
      await zoomControl.click();
      await expect(zoomControl).toHaveAttribute("aria-pressed", "true");
      await expectSelectionAligned(page, ["nested-note-b", "nested-note-c"]);
    }

    await page.getByRole("button", { name: "Set zoom to 100%" }).click();
    const deepNote = page.locator('[data-proof-section-id="nested-note-b"]');
    await deepNote.scrollIntoViewIfNeeded();
    const deepNoteBox = await deepNote.boundingBox();
    if (!deepNoteBox) {
      throw new Error("The deep marquee target must be measurable.");
    }
    await dragMarquee(page, {
      x: deepNoteBox.x - 4,
      y: deepNoteBox.y - 4,
      width: deepNoteBox.width + 8,
      height: deepNoteBox.height + 8,
    });
    await expect(page.locator("[data-proof-selection-ids]")).toHaveText("Selection: nested-note-b");
    await expectSelectionAligned(page);

    await page.getByRole("button", { name: "Marquee: full" }).click();
    await expect(page.getByRole("button", { name: "Marquee: partial" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const currentDeepNoteBox = await deepNote.boundingBox();
    if (!currentDeepNoteBox) {
      throw new Error("The partial marquee target must remain measurable.");
    }
    await dragMarquee(page, {
      x: currentDeepNoteBox.x + currentDeepNoteBox.width / 2,
      y: currentDeepNoteBox.y + currentDeepNoteBox.height / 2,
      width: 12,
      height: 12,
    });
    await expect(page.locator("[data-proof-selection-ids]")).toContainText(
      "root-alpha, nested-container, nested-note-b",
    );
    await expect(page.locator(".setta-adapter-proof__selection-overlay")).toHaveAttribute(
      "data-proof-selection-roots",
      "root-alpha",
    );
    await expectSelectionAligned(page, ["root-alpha"]);
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
