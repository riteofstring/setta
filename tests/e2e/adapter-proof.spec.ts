import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const proofUrl = "/?adapter-proof";
const proofRootIds = ["root-alpha", "root-beta"] as const;

async function readNumericAttribute(locator: Locator, attribute: string): Promise<number> {
  const value = await locator.getAttribute(attribute);
  if (value === null || !Number.isFinite(Number(value))) {
    throw new Error(`${attribute} must contain a finite numeric proof value.`);
  }
  return Number(value);
}

async function rootRenderCounts(
  page: Page,
): Promise<Record<(typeof proofRootIds)[number], number>> {
  const entries = await Promise.all(
    proofRootIds.map(async (rootId) => {
      const root = page.locator(`.react-flow__node[data-id="${rootId}"] [data-proof-render-count]`);
      return [rootId, await readNumericAttribute(root, "data-proof-render-count")] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof proofRootIds)[number], number>;
}

async function settleVisualFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function dispatchWheelBurst(
  page: Page,
  point: { x: number; y: number },
  eventCount: number,
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  for (let index = 0; index < eventCount; index += 1) {
    await page.mouse.wheel(3, 4);
  }
  await settleVisualFrames(page);
}

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

async function findBlankCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.locator(".setta-adapter-proof__canvas").evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    const sectionBounds = [...canvas.querySelectorAll<HTMLElement>("[data-proof-section-id]")].map(
      (section) => section.getBoundingClientRect(),
    );
    for (let y = bounds.bottom - 80; y > bounds.top + 80; y -= 48) {
      for (let x = bounds.right - 100; x > bounds.left + 100; x -= 48) {
        const element = document.elementFromPoint(x, y);
        const intersectsSection = sectionBounds.some(
          (section) =>
            x >= section.left && x <= section.right && y >= section.top && y <= section.bottom,
        );
        if (
          element &&
          canvas.contains(element) &&
          !intersectsSection &&
          !element.closest(
            "[data-proof-section-id], .setta-adapter-proof__controls, .react-flow__controls",
          )
        ) {
          return { x, y };
        }
      }
    }
    throw new Error("The adapter proof needs one measurable blank canvas point.");
  });
}

async function findOutsideCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.locator(".setta-adapter-proof__canvas").evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    const candidates = [
      { x: bounds.left + bounds.width / 2, y: bounds.top - 16 },
      { x: bounds.left - 16, y: bounds.top + bounds.height / 2 },
      { x: bounds.right + 16, y: bounds.top + bounds.height / 2 },
      { x: bounds.left + bounds.width / 2, y: bounds.bottom + 16 },
    ];
    const point = candidates.find(
      ({ x, y }) =>
        x >= 1 &&
        x < innerWidth - 1 &&
        y >= 1 &&
        y < innerHeight - 1 &&
        (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom),
    );
    if (!point) {
      throw new Error("The adapter proof needs one visible point outside its canvas.");
    }
    return point;
  });
}

async function findVisibleActionPoint(locator: Locator): Promise<{ x: number; y: number }> {
  return locator.evaluate((element) => {
    const clipToVisibleCanvas = (bounds: DOMRect, canvasBounds?: DOMRect) => {
      const clipBounds = canvasBounds ?? {
        bottom: innerHeight,
        left: 0,
        right: innerWidth,
        top: 0,
      };
      return {
        bottom: Math.min(bounds.bottom, clipBounds.bottom, innerHeight),
        left: Math.max(bounds.left, clipBounds.left, 0),
        right: Math.min(bounds.right, clipBounds.right, innerWidth),
        top: Math.max(bounds.top, clipBounds.top, 0),
      };
    };
    const findActionPoint = (bounds: {
      bottom: number;
      left: number;
      right: number;
      top: number;
    }) => {
      for (let row = 1; row <= 4; row += 1) {
        for (let column = 1; column <= 4; column += 1) {
          const x = bounds.left + ((bounds.right - bounds.left) * column) / 5;
          const y = bounds.top + ((bounds.bottom - bounds.top) * row) / 5;
          const hit = document.elementFromPoint(x, y);
          if (hit === element || (hit && element.contains(hit))) {
            return { x, y };
          }
        }
      }
      return undefined;
    };

    const bounds = element.getBoundingClientRect();
    const canvasBounds = element.closest(".setta-adapter-proof__canvas")?.getBoundingClientRect();
    const actionPoint = findActionPoint(clipToVisibleCanvas(bounds, canvasBounds));
    if (actionPoint) {
      return actionPoint;
    }
    throw new Error(
      `The drag handle has no actionable point in the canvas: ${JSON.stringify({
        bounds: bounds.toJSON(),
        canvasBounds: canvasBounds?.toJSON(),
      })}`,
    );
  });
}

async function expectBlockPlaceholderAligned(page: Page, sectionIds: readonly string[]) {
  const placeholder = page.locator('[data-proof-drag-placeholder="source"]');
  const sections = sectionIds.map((sectionId) =>
    page.locator(`[data-proof-section-id="${sectionId}"]`),
  );
  await expect(placeholder).toBeVisible();
  await expect
    .poll(async () => {
      const boxes = await Promise.all(sections.map((section) => section.boundingBox()));
      const placeholderBox = await placeholder.boundingBox();
      if (!placeholderBox || boxes.some((box) => !box)) {
        return Number.POSITIVE_INFINITY;
      }
      const measured = boxes.filter((box) => box !== null);
      const left = Math.min(...measured.map((box) => box.x));
      const top = Math.min(...measured.map((box) => box.y));
      const right = Math.max(...measured.map((box) => box.x + box.width));
      const bottom = Math.max(...measured.map((box) => box.y + box.height));
      return Math.max(
        Math.abs(left - placeholderBox.x),
        Math.abs(top - placeholderBox.y),
        Math.abs(right - (placeholderBox.x + placeholderBox.width)),
        Math.abs(bottom - (placeholderBox.y + placeholderBox.height)),
      );
    })
    .toBeLessThanOrEqual(2);
}

async function dispatchTouchDrag({
  onActivated,
  onBeforeEnd,
  page,
  source,
  target,
}: {
  page: Page;
  onActivated(): Promise<void>;
  onBeforeEnd(): Promise<void>;
  source: { x: number; y: number };
  target: { x: number; y: number };
}) {
  const cdp = await page.context().newCDPSession(page);
  const touchPoint = (x: number, y: number) => ({
    force: 1,
    id: 71,
    radiusX: 1,
    radiusY: 1,
    x,
    y,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    touchPoints: [touchPoint(source.x, source.y)],
    type: "touchStart",
  });
  await page.waitForTimeout(300);
  await onActivated();
  for (let index = 1; index <= 12; index += 1) {
    const progress = index / 12;
    await cdp.send("Input.dispatchTouchEvent", {
      touchPoints: [
        touchPoint(
          source.x + (target.x - source.x) * progress,
          source.y + (target.y - source.y) * progress,
        ),
      ],
      type: "touchMove",
    });
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
  await onBeforeEnd();
  await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await cdp.detach();
}

async function moveKeyboardDragDown(page: Page, expectedY: number) {
  const diagnostics = page.locator("[data-proof-drag-transform]");
  const previousTransform = `0,${String(expectedY - 72)}`;
  const expectedTransform = `0,${String(expectedY)}`;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press("ArrowDown");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const transform = await diagnostics.getAttribute("data-proof-drag-transform");
    if (transform === expectedTransform) {
      return;
    }
    expect(transform).toBe(previousTransform);
  }
  throw new Error(
    `The trusted keyboard drag did not reach ${expectedTransform} after scrolling reachable containers.`,
  );
}

test.describe("upstream adapter proof", () => {
  test("shares transformed geometry across nested selection, focus, resize, and scrolling", async ({
    page,
  }) => {
    await page.goto(proofUrl);

    await expect(page.locator("[data-proof-geometry-count]")).toContainText("Frames: 8");
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
    await expect(page.getByRole("group", { name: "Adapter proof controls" })).toBeVisible();
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
    await expect(
      selectedSection.getByRole("button", { name: "Decision note", exact: true }),
    ).toBeFocused();
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

    await page.getByRole("button", { name: "Research note", exact: true }).click();
    await page
      .getByRole("button", { name: "Horizontal container", exact: true })
      .click({ modifiers: ["Shift"] });
    await expect(page.locator("[data-proof-selection-ids]")).toHaveText(
      "Selection: nested-note-a, nested-container",
    );
    await expect(page.locator(".setta-adapter-proof__selection-overlay")).toHaveAttribute(
      "data-proof-selection-roots",
      "nested-note-a,nested-container",
    );
    await expect(page.locator("[data-proof-marquee]")).toHaveCount(0);

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

    const defaultZoomControl = page.getByRole("button", { name: "Set zoom to 100%" });
    await defaultZoomControl.click();
    await expect(defaultZoomControl).toHaveAttribute("aria-pressed", "true");
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
    await page.getByRole("button", { name: "Focus selected" }).click();
    await expect(page.locator('[data-proof-section-id="root-alpha"]')).toBeFocused();
  });

  test("keeps one movement owner and emits one command only on accepted completion", async ({
    page,
  }) => {
    await page.goto(proofUrl);
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
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
    await expect(cancelHandle).toBeFocused();
    await expect(commandCount).toHaveText("Commands: 0");
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("0");

    const sourceHandle = page.getByRole("button", { name: "Move Research note" });
    await sourceHandle.scrollIntoViewIfNeeded();
    const target = page.locator('[data-proof-section-id="nested-container"]');
    const sourceBox = await sourceHandle.boundingBox();
    if (!sourceBox) {
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
    await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await settleVisualFrames(page);
    const targetBox = await target.boundingBox();
    if (!targetBox) {
      throw new Error("The nested reorder target must be measurable after scrolling.");
    }
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height * 0.65,
      { steps: 12 },
    );
    await expect(page.locator('[data-proof-drag-placeholder="destination"]')).toHaveAttribute(
      "data-proof-destination-target",
      "nested-container",
    );
    await settleVisualFrames(page);
    const settledTargetBox = await target.boundingBox();
    if (!settledTargetBox) {
      throw new Error(
        "The nested reorder target must remain measurable after auto-scroll settles.",
      );
    }
    await page.mouse.move(
      settledTargetBox.x + settledTargetBox.width / 2,
      settledTargetBox.y + settledTargetBox.height * 0.65,
      { steps: 2 },
    );
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

  test("clears a stale nested preview before an invalid pointer completion", async ({ page }) => {
    await page.goto(proofUrl);
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
    const sourceHandle = page.getByRole("button", { name: "Move Research note" });
    await sourceHandle.scrollIntoViewIfNeeded();
    const target = page.locator('[data-proof-section-id="nested-note-d"]');
    const sourceBox = await sourceHandle.boundingBox();
    if (!sourceBox) {
      throw new Error("The stale-target proof requires a measured nested target.");
    }
    const sourcePoint = {
      x: sourceBox.x + sourceBox.width / 2,
      y: sourceBox.y + sourceBox.height / 2,
    };

    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    await page.mouse.down();
    await page.mouse.move(sourcePoint.x + 8, sourcePoint.y, { steps: 4 });
    const planningRoot = page.locator('.react-flow__node[data-id="root-alpha"]');
    await expect
      .poll(() => planningRoot.evaluate((element) => getComputedStyle(element).zIndex))
      .toBe("1000");
    await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const targetBox = await target.boundingBox();
    if (!targetBox) {
      throw new Error("The stale-target proof target must remain measured after nested scrolling.");
    }
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 12, {
      steps: 12,
    });
    await expect(page.locator('[data-proof-drag-placeholder="destination"]')).toBeVisible();

    const outsidePoint = await findOutsideCanvasPoint(page);
    await page.mouse.move(outsidePoint.x, outsidePoint.y, { steps: 12 });
    await expect(page.locator('[data-proof-drag-placeholder="destination"]')).toHaveCount(0);
    await expect(page.locator("[data-proof-resolved-target]")).not.toHaveAttribute(
      "data-proof-resolved-target",
      "nested-note-d",
    );
    await page.mouse.up();

    await expect(page.locator("[data-proof-command-count]")).toHaveText("Commands: 0");
    await expect(page.locator("[data-proof-commit-key]")).toHaveAttribute(
      "data-proof-commit-key",
      "none",
    );
  });

  test("completes selection-block canvas drops with preview parity at every proof zoom", async ({
    page,
  }) => {
    for (const zoomPercent of [50, 100, 200]) {
      await page.goto(proofUrl);
      await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
      await page.getByRole("button", { name: "Select sibling block" }).click();
      await page.getByRole("button", { name: "Move mode: sort" }).click();
      const zoomControl = page.getByRole("button", { name: `Set zoom to ${zoomPercent}%` });
      await zoomControl.click();
      await expect(zoomControl).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Focus selected" }).click();
      await expect(page.getByRole("button", { name: "Research note", exact: true })).toBeFocused();
      await settleVisualFrames(page);

      const sourceSection = page.locator('[data-proof-section-id="nested-note-a"]');
      const secondSection = page.locator('[data-proof-section-id="nested-container"]');
      const sourceHandle = page.getByRole("button", { name: "Move Research note" });
      const sourceBox = await sourceSection.boundingBox();
      const secondBox = await secondSection.boundingBox();
      const handlePoint = await findVisibleActionPoint(sourceHandle);
      if (!sourceBox || !secondBox) {
        throw new Error("The selection-block canvas proof requires measured source sections.");
      }
      const originalOffset = {
        x: secondBox.x - sourceBox.x,
        y: secondBox.y - sourceBox.y,
      };
      const blankPoint = await findBlankCanvasPoint(page);
      const planningRoot = page.locator(
        '.react-flow__node[data-id="root-alpha"] [data-proof-render-count]',
      );
      const renderCountBefore = Number(await planningRoot.getAttribute("data-proof-render-count"));

      await page.mouse.move(handlePoint.x, handlePoint.y);
      await page.mouse.down();
      await page.mouse.move(handlePoint.x + 8, handlePoint.y, { steps: 4 });
      await page.mouse.move(blankPoint.x, blankPoint.y, { steps: 24 });

      await expect(page.locator("[data-proof-drag-owner]")).toHaveAttribute(
        "data-proof-drag-owner",
        "section-structure",
      );
      await expect(page.locator("[data-proof-drag-input]")).toHaveAttribute(
        "data-proof-drag-input",
        "pointer",
      );
      await expectBlockPlaceholderAligned(page, ["nested-note-a", "nested-container"]);
      const destinationPlaceholder = page.locator('[data-proof-drag-placeholder="destination"]');
      await expect(destinationPlaceholder).toHaveAttribute(
        "data-proof-destination-target",
        "adapter-proof-canvas",
      );
      const previewKey = await destinationPlaceholder.getAttribute("data-proof-destination-key");
      expect(previewKey).toContain("free:canvas:");
      expect(
        Number(await planningRoot.getAttribute("data-proof-render-count")),
      ).toBeLessThanOrEqual(renderCountBefore + 1);

      await page.mouse.up();
      await expect(page.locator("[data-proof-command-count]")).toHaveText("Commands: 1");
      await expect(page.locator("[data-proof-preview-key]")).toHaveAttribute(
        "data-proof-preview-key",
        previewKey ?? "missing",
      );
      await expect(page.locator("[data-proof-commit-key]")).toHaveAttribute(
        "data-proof-commit-key",
        previewKey ?? "missing",
      );

      const movedFirst = page.locator('.react-flow__node[data-id="nested-note-a"]');
      const movedSecond = page.locator('.react-flow__node[data-id="nested-container"]');
      await expect(movedFirst).toBeVisible();
      await expect(movedSecond).toBeAttached();
      const movedFirstBox = await movedFirst.boundingBox();
      const movedSecondBox = await movedSecond.boundingBox();
      if (!movedFirstBox || !movedSecondBox) {
        throw new Error("The committed selection block must remain measurable.");
      }
      expect(movedSecondBox.x - movedFirstBox.x).toBeCloseTo(originalOffset.x, 0);
      expect(movedSecondBox.y - movedFirstBox.y).toBeCloseTo(originalOffset.y, 0);
    }
  });

  test("retains the active sort owner when mode changes during a block drag", async ({ page }) => {
    await page.goto(proofUrl);
    await page.getByRole("button", { name: "Select sibling block" }).click();
    const sourceHandle = page.getByRole("button", { name: "Move Research note" });
    const target = page.locator('[data-proof-section-id="nested-note-d"]');
    const sourceBox = await sourceHandle.boundingBox();
    if (!sourceBox) {
      throw new Error("The runtime mode-change proof requires measured drag controls.");
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
    await page.locator("[data-proof-mode-control]").evaluate((control) => {
      (control as HTMLButtonElement).click();
    });
    await expect(page.getByRole("button", { name: "Move mode: free" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("[data-proof-drag-mode]")).toHaveAttribute(
      "data-proof-drag-mode",
      "sort",
    );
    await expect(page.locator("[data-proof-drag-owner]")).toHaveAttribute(
      "data-proof-drag-owner",
      "section-structure",
    );

    await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const targetBox = await target.boundingBox();
    if (!targetBox) {
      throw new Error("The scrolled runtime mode-change target must remain measurable.");
    }
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 8, { steps: 12 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 8, {
      steps: 20,
    });
    const destination = page.locator('[data-proof-drag-placeholder="destination"]');
    await expect(destination).toHaveAttribute("data-proof-destination-target", "nested-note-d");
    const previewKey = await destination.getAttribute("data-proof-destination-key");
    expect(previewKey).toContain("sort:root-alpha:");
    await page.mouse.up();

    await expect(page.locator("[data-proof-command-count]")).toHaveText("Commands: 1");
    await expect(page.locator("[data-proof-commit-key]")).toHaveAttribute(
      "data-proof-commit-key",
      previewKey ?? "missing",
    );
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
      .toEqual(["nested-note-d", "nested-note-a", "nested-container"]);
  });

  test("accepts keyboard sorting through the structural owner", async ({ page }) => {
    await page.goto(proofUrl);
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
    const keyboardHandle = page.getByRole("button", { name: "Move Research note" });
    await keyboardHandle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-proof-drag-input]")).toHaveAttribute(
      "data-proof-drag-input",
      "keyboard",
    );
    await expect(page.locator("[data-proof-drag-owner]")).toHaveAttribute(
      "data-proof-drag-owner",
      "section-structure",
    );
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(page.locator("[data-proof-drag-transform]")).toHaveAttribute(
      "data-proof-drag-transform",
      "0,0",
    );
    for (const expectedY of [72, 144, 216, 288]) {
      await moveKeyboardDragDown(page, expectedY);
    }
    await expect(page.locator('[data-proof-drag-placeholder="destination"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-proof-command-count]")).toHaveText("Commands: 1");
    await expect(keyboardHandle).toBeFocused();
  });

  test.describe("touch input", () => {
    test.use({ hasTouch: true });

    test("accepts touch sorting through the structural owner", async ({ page }) => {
      await page.goto(proofUrl);
      await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
      const touchHandle = page.getByRole("button", { name: "Move Research note" });
      await touchHandle.evaluate((element) =>
        element.scrollIntoView({ block: "center", inline: "center" }),
      );
      const touchTarget = page.locator('[data-proof-section-id="nested-container"]');
      const touchHandleBox = await touchHandle.boundingBox();
      const touchTargetBox = await touchTarget.boundingBox();
      if (!touchHandleBox || !touchTargetBox) {
        throw new Error("The touch ownership proof requires measured drag controls.");
      }
      await dispatchTouchDrag({
        onActivated: async () => {
          await expect(page.locator("[data-proof-drag-input]")).toHaveAttribute(
            "data-proof-drag-input",
            "touch",
          );
          await expect(page.locator("[data-proof-drag-owner]")).toHaveAttribute(
            "data-proof-drag-owner",
            "section-structure",
          );
        },
        onBeforeEnd: async () => {
          await expect(page.locator('[data-proof-drag-placeholder="destination"]')).toHaveAttribute(
            "data-proof-destination-target",
            "nested-container",
          );
        },
        page,
        source: {
          x: touchHandleBox.x + touchHandleBox.width / 2,
          y: touchHandleBox.y + touchHandleBox.height / 2,
        },
        target: {
          x: touchTargetBox.x + touchTargetBox.width / 2,
          y: touchTargetBox.y + touchTargetBox.height - 8,
        },
      });
      await expect(page.locator("[data-proof-command-count]")).toHaveText("Commands: 1");
    });
  });

  test("bounds recursive renders across high-frequency structural, root, and viewport movement", async ({
    page,
  }) => {
    await page.goto(proofUrl);
    await expect(page.locator("[data-proof-initial-fit]")).toHaveText("Initial fit: ready");
    const commandCount = page.locator("[data-proof-command-count]");
    const dragDiagnostics = page.locator(".setta-adapter-proof__drag-diagnostics");
    const geometryDiagnostics = page.locator("[data-proof-geometry-count]");
    const structuralRenderStart = await rootRenderCounts(page);
    const dragUpdateStart = await readNumericAttribute(
      dragDiagnostics,
      "data-proof-drag-update-count",
    );

    const nestedHandle = page.getByRole("button", { name: "Move Research note" });
    const nestedTarget = page.locator('[data-proof-section-id="nested-container"]');
    await nestedTarget.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const nestedStart = await findVisibleActionPoint(nestedHandle);
    const nestedTargetBox = await nestedTarget.boundingBox();
    if (!nestedTargetBox) {
      throw new Error("The high-frequency structural target must be measurable.");
    }
    await page.mouse.move(nestedStart.x, nestedStart.y);
    await page.mouse.down();
    await page.mouse.move(nestedStart.x + 8, nestedStart.y, { steps: 4 });
    await page.mouse.move(
      nestedTargetBox.x + nestedTargetBox.width / 2,
      nestedTargetBox.y + nestedTargetBox.height - 8,
      { steps: 96 },
    );
    await expect(page.locator("[data-proof-drag-owner]")).toHaveAttribute(
      "data-proof-drag-owner",
      "section-structure",
    );
    const structuralRenderActive = await rootRenderCounts(page);
    const dragUpdateActive = await readNumericAttribute(
      dragDiagnostics,
      "data-proof-drag-update-count",
    );
    expect(structuralRenderActive).toEqual(structuralRenderStart);
    expect(dragUpdateActive - dragUpdateStart).toBeGreaterThanOrEqual(48);
    expect(dragUpdateActive - dragUpdateStart).toBeLessThanOrEqual(240);
    await page.mouse.up();
    await expect(commandCount).toHaveText("Commands: 1");
    const structuralRenderComplete = await rootRenderCounts(page);
    for (const rootId of proofRootIds) {
      expect(structuralRenderComplete[rootId] - structuralRenderStart[rootId]).toBeLessThanOrEqual(
        2,
      );
    }

    const rootHandle = page.getByRole("button", { name: "Move Planning section" });
    const rootStart = await findVisibleActionPoint(rootHandle);
    const rootRenderStart = await rootRenderCounts(page);
    const rootGeometryStart = await readNumericAttribute(
      geometryDiagnostics,
      "data-proof-geometry-revision",
    );
    await page.mouse.move(rootStart.x, rootStart.y);
    await page.mouse.down();
    await page.mouse.move(rootStart.x + 120, rootStart.y + 64, { steps: 96 });
    await settleVisualFrames(page);
    await expectSelectionAligned(page);
    expect(await rootRenderCounts(page)).toEqual(rootRenderStart);
    const rootGeometryActive = await readNumericAttribute(
      geometryDiagnostics,
      "data-proof-geometry-revision",
    );
    expect(rootGeometryActive).toBeGreaterThan(rootGeometryStart);
    await page.mouse.up();
    await expect(commandCount).toHaveText("Commands: 2");
    const rootRenderComplete = await rootRenderCounts(page);
    for (const rootId of proofRootIds) {
      expect(rootRenderComplete[rootId] - rootRenderStart[rootId]).toBeLessThanOrEqual(2);
    }

    const viewportRenderStart = await rootRenderCounts(page);
    const viewportGeometryStart = await readNumericAttribute(
      geometryDiagnostics,
      "data-proof-geometry-revision",
    );
    const viewportTransform = page.locator(".react-flow__viewport");
    const transformBefore = await viewportTransform.getAttribute("style");
    await dispatchWheelBurst(page, await findBlankCanvasPoint(page), 96);
    await expect.poll(() => viewportTransform.getAttribute("style")).not.toBe(transformBefore);
    const viewportRenderComplete = await rootRenderCounts(page);
    expect(viewportRenderComplete).toEqual(viewportRenderStart);
    const viewportGeometryComplete = await readNumericAttribute(
      geometryDiagnostics,
      "data-proof-geometry-revision",
    );
    expect(viewportGeometryComplete - viewportGeometryStart).toBeLessThanOrEqual(16);

    test.info().annotations.push({
      type: "phase-0-browser-baseline",
      description: JSON.stringify({
        dragStorePublications: dragUpdateActive - dragUpdateStart,
        rootGeometryRevisions: rootGeometryActive - rootGeometryStart,
        structuralActiveRootRenderDelta: proofRootIds.map(
          (rootId) => structuralRenderActive[rootId] - structuralRenderStart[rootId],
        ),
        viewportGeometryRevisions: viewportGeometryComplete - viewportGeometryStart,
        viewportRootRenderDelta: proofRootIds.map(
          (rootId) => viewportRenderComplete[rootId] - viewportRenderStart[rootId],
        ),
      }),
    });
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
