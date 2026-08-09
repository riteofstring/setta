import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function requiredBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} must expose browser geometry.`);
  return box;
}

async function expectPortAtSectionEdge(
  port: Locator,
  section: Locator,
  side: "left" | "right",
): Promise<void> {
  const [portBox, sectionBox] = await Promise.all([
    requiredBox(port, "The workspace port"),
    requiredBox(section, "The workspace section"),
  ]);
  const portCenter = portBox.x + portBox.width / 2;
  const sectionEdge = side === "left" ? sectionBox.x : sectionBox.x + sectionBox.width;
  expect(portCenter).toBeCloseTo(sectionEdge, 0);
}

async function connectionSurface(page: Page) {
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  const descriptions = workspace.getByRole("group", {
    name: "Canvas shell workspace connections",
  });
  const visual = workspace.locator(".setta-workspace__connections");
  await expect(descriptions).toContainText("4 ports and 2 edges.");
  await expect(descriptions).toContainText(
    "Review flow: Nested Alpha, Review output to Nested Gamma, Review input. Directed.",
  );
  await expect(descriptions).toContainText(
    "Shared context: Nested Beta, Context to Empty container, Context. Undirected.",
  );
  await expect(visual).toHaveAttribute("data-workspace-visible-port-count", "4");
  await expect(visual).toHaveAttribute("data-workspace-visible-edge-count", "2");
  return { visual, workspace };
}

test("generic ports and edges follow recursive section geometry through zoom and scroll", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1_280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell&connections");

  const { visual, workspace } = await connectionSurface(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  const sourcePort = visual
    .locator('[data-workspace-port-section-id="nested-alpha"][data-workspace-port-id="review-out"]')
    .locator(".setta-workspace__connection-port");
  const targetPort = visual
    .locator('[data-workspace-port-section-id="nested-gamma"][data-workspace-port-id="review-in"]')
    .locator(".setta-workspace__connection-port");
  const sourceSection = workspace.locator('[data-workspace-section-id="nested-alpha"]');
  const targetSection = workspace.locator('[data-workspace-section-id="nested-gamma"]');
  await expectPortAtSectionEdge(sourcePort, sourceSection, "right");
  await expectPortAtSectionEdge(targetPort, targetSection, "left");
  const initialPortWidth = (await requiredBox(sourcePort, "The source port")).width;

  const reviewPath = visual
    .locator('[data-workspace-edge-id="nested-review-flow"]')
    .locator(".setta-workspace__connection-edge");
  const initialPath = await reviewPath.getAttribute("d");
  if (!initialPath) throw new Error("The recursive review edge must expose a route.");
  const nestedRow = workspace.getByRole("region", { name: "Nested row child sections" });
  await nestedRow.evaluate((element) => {
    element.scrollLeft = Math.min(element.scrollWidth - element.clientWidth, 72);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect.poll(() => reviewPath.getAttribute("d")).not.toBe(initialPath);
  await expectPortAtSectionEdge(targetPort, targetSection, "left");

  await workspace.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => (await requiredBox(sourcePort, "The zoomed source port")).width)
    .toBeCloseTo(initialPortWidth, 0);
  await expectPortAtSectionEdge(sourcePort, sourceSection, "right");
  await expectPortAtSectionEdge(targetPort, targetSection, "left");

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Canvas shell workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.mouse.move(2, 2);
  await expect(workspace).toHaveScreenshot("workspace-connections.png");
});

test("connection descriptions and visuals survive dark 320-pixel reflow and 200% page scale", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell&connections");
  const { visual, workspace } = await connectionSurface(page);

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(visual).toHaveAttribute("data-workspace-visible-edge-count", "2");
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Canvas shell workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(workspace).toHaveScreenshot("workspace-connections-narrow-dark.png");
});
