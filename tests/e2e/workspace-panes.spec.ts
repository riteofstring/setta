import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function resetExample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show workspace data" }).click();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset workspace" })
    .click();
  await expect(page.getByRole("article", { name: "Welcome note" })).toBeVisible();
  await page.getByRole("button", { name: "Hide workspace data" }).click();
}

function paneTrigger(workspace: Locator, name: string): Locator {
  return workspace.getByRole("button", { exact: true, name });
}

test("registered panes share one toolbar owner and preserve measured canvas space", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1_280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await resetExample(page);
  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  const sectionsTrigger = paneTrigger(workspace, "Sections");
  const savedViewsTrigger = paneTrigger(workspace, "Saved views");
  await expect(sectionsTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(savedViewsTrigger).toHaveAttribute("aria-expanded", "false");

  await sectionsTrigger.click();
  await expect(sectionsTrigger).toBeFocused();
  await expect(sectionsTrigger).toHaveAttribute("aria-expanded", "true");
  const sectionsPane = workspace.getByRole("complementary", { name: "Sections" });
  await expect(sectionsPane).toHaveAttribute("data-workspace-pane-placement", "start");
  await expect(workspace.getByRole("navigation", { name: "Workspace sections" })).toBeVisible();
  expect(await sectionsTrigger.getAttribute("aria-controls")).toBe(
    await sectionsPane.getAttribute("id"),
  );

  const [paneBounds, canvasBounds] = await Promise.all([
    sectionsPane.boundingBox(),
    workspace.locator(".setta-workspace__pane-canvas").boundingBox(),
  ]);
  if (!paneBounds || !canvasBounds) {
    throw new Error("The registered pane and canvas must expose browser geometry.");
  }
  expect(paneBounds.x + paneBounds.width).toBeLessThanOrEqual(canvasBounds.x + 1);
  expect(paneBounds.height).toBeCloseTo(canvasBounds.height, 0);

  await page.mouse.move(1, 1);
  await expect(workspace.locator(".setta-workspace__pane-layout")).toHaveScreenshot(
    "workspace-registered-pane.png",
  );
  const accessibility = await new AxeBuilder({ page })
    .include(".setta-workspace__pane-layout")
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await savedViewsTrigger.click();
  await expect(savedViewsTrigger).toBeFocused();
  await expect(sectionsTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(sectionsPane).toHaveCount(0);
  const savedViewsPane = workspace.getByRole("complementary", { name: "Saved views" });
  await expect(savedViewsPane).toHaveAttribute("data-workspace-pane-placement", "end");
  await expect(savedViewsPane.getByRole("region", { name: "Saved workspace views" })).toBeVisible();

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(savedViewsPane).toBeVisible();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const close = savedViewsPane.getByRole("button", { name: "Close Saved views" });
  expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.detach();

  await close.click();
  await expect(savedViewsTrigger).toBeFocused();
  await expect(savedViewsTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(savedViewsPane).toHaveCount(0);
});

test("registered panes stack at 320 CSS pixels and mirror logical placement in RTL", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await resetExample(page);
  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  await workspace.evaluate((element) => element.setAttribute("dir", "rtl"));
  await paneTrigger(workspace, "Sections").click();
  const pane = workspace.getByRole("complementary", { name: "Sections" });
  const canvas = workspace.locator(".setta-workspace__pane-canvas");
  const [documentWidths, paneBounds, canvasBounds, workspaceBounds] = await Promise.all([
    page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
    pane.boundingBox(),
    canvas.boundingBox(),
    workspace.boundingBox(),
  ]);
  if (!paneBounds || !canvasBounds || !workspaceBounds) {
    throw new Error("The narrow pane, canvas, and workspace must expose browser geometry.");
  }

  expect(documentWidths.scrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth);
  expect(paneBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
  expect(paneBounds.x + paneBounds.width).toBeLessThanOrEqual(
    workspaceBounds.x + workspaceBounds.width,
  );
  expect(paneBounds.y + paneBounds.height).toBeLessThanOrEqual(canvasBounds.y + 1);
  await expect(pane).toHaveCSS("direction", "rtl");
  expect(
    await pane
      .getByRole("button", { name: "Close Sections" })
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");

  await page.mouse.move(1, 1);
  await expect(workspace.locator(".setta-workspace__pane-layout")).toHaveScreenshot(
    "workspace-registered-pane-narrow-dark.png",
  );
});
