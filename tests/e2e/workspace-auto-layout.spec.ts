import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

type SerializedWorkspace = Readonly<{
  rootSections: readonly Readonly<{
    position: Readonly<{ x: number; y: number }>;
    sectionId: string;
  }>[];
  sections: Readonly<Record<string, unknown>>;
  viewport: Readonly<{ x: number; y: number; zoom: number }>;
}>;

async function resetExample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show workspace data" }).click();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset workspace" })
    .click();
  await expect(page.getByRole("article", { name: "Welcome note" })).toBeVisible();
}

async function workspaceDocument(page: Page): Promise<SerializedWorkspace> {
  return JSON.parse(await page.getByTestId("workspace-json").inputValue()) as SerializedWorkspace;
}

function minimumRootPosition(document: SerializedWorkspace): Readonly<{ x: number; y: number }> {
  return {
    x: Math.min(...document.rootSections.map(({ position }) => position.x)),
    y: Math.min(...document.rootSections.map(({ position }) => position.y)),
  };
}

async function renderedRootRectangles(workspace: Locator) {
  return workspace.locator("[data-workspace-section-id]").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        sectionId: element.getAttribute("data-workspace-section-id"),
        top: rect.top,
      };
    }),
  );
}

function rectanglesOverlap(
  left: Readonly<{ bottom: number; left: number; right: number; top: number }>,
  right: Readonly<{ bottom: number; left: number; right: number; top: number }>,
): boolean {
  return !(
    left.right <= right.left ||
    right.right <= left.left ||
    left.bottom <= right.top ||
    right.bottom <= left.top
  );
}

test("the host command packs measured roots atomically and remains undoable", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await resetExample(page);

  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  const arrange = workspace.getByRole("button", { name: "Arrange sections" });
  const selected = workspace.locator('[data-workspace-section-id="example-note"]');
  await selected.getByRole("button", { name: "Select Welcome note" }).click();
  const before = await workspaceDocument(page);

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await arrange.focus();
  await expect(arrange).toBeFocused();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  await arrange.click();
  await expect(page.locator(".announcement")).toHaveText("Top-level sections arranged.");
  await expect
    .poll(async () => (await workspaceDocument(page)).rootSections)
    .not.toEqual(before.rootSections);
  const arranged = await workspaceDocument(page);

  expect(arranged.rootSections.map(({ sectionId }) => sectionId)).toEqual(
    before.rootSections.map(({ sectionId }) => sectionId),
  );
  expect(minimumRootPosition(arranged)).toEqual(minimumRootPosition(before));
  expect(arranged.sections).toEqual(before.sections);
  expect(arranged.viewport).toEqual(before.viewport);
  await expect(selected).toHaveAttribute("data-workspace-selected", "true");

  const rectangles = await renderedRootRectangles(workspace);
  expect(rectangles).toHaveLength(3);
  expect(
    rectangles.some((rectangle, index) =>
      rectangles.slice(index + 1).some((candidate) => rectanglesOverlap(rectangle, candidate)),
    ),
  ).toBe(false);

  await workspace.getByRole("button", { name: "Fit sections" }).click();
  const pane = page.locator(".react-flow__pane");
  const paneBounds = await pane.boundingBox();
  if (!paneBounds) throw new Error("The workspace pane is not measurable.");
  await page.mouse.click(paneBounds.x + paneBounds.width - 96, paneBounds.y + 96);
  await expect(selected).toHaveAttribute("data-workspace-selected", "false");
  await page.mouse.move(paneBounds.x + paneBounds.width - 48, paneBounds.y + 48);
  await expect(workspace).toHaveScreenshot("workspace-auto-layout.png");

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await workspaceDocument(page)).rootSections)
    .toEqual(before.rootSections);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await workspaceDocument(page)).rootSections)
    .toEqual(arranged.rootSections);

  await selected.getByRole("button", { name: "Lock Welcome note" }).click();
  await arrange.click();
  await expect(page.locator(".announcement")).toHaveText(
    "Unlock all top-level sections before arranging them.",
  );
  expect((await workspaceDocument(page)).rootSections).toEqual(arranged.rootSections);

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Section workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the host control is disabled in read-only mode and reflows at 320 CSS pixels", async ({
  page,
}) => {
  await page.goto("/");
  await resetExample(page);
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?read-only");

  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  await expect(workspace.getByRole("button", { name: "Arrange sections" })).toBeDisabled();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Section workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
