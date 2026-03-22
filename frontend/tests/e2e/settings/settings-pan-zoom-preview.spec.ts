import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

test("settings tier1 preview mode uses image overlays without unmounting live bodies", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();

  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-section-body-preview-root]").length > 0,
  );

  await panCanvas(page, { deltaX: 120, deltaY: 80 });

  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-section-body-preview-status="ready"]')
        .length > 0,
    undefined,
    { timeout: 20000 },
  );

  const totalPreviewRoots = await page
    .locator("[data-section-body-preview-root]")
    .count();
  const readyAfterWarmup = await page
    .locator('[data-section-body-preview-status="ready"]')
    .count();

  expect(readyAfterWarmup).toBeGreaterThan(0);
  expect(readyAfterWarmup).toBeLessThan(totalPreviewRoots * 0.65);

  await panCanvas(page, { deltaX: 140, deltaY: 60, keepMouseDown: true });

  await page.waitForFunction(
    () => document.querySelectorAll('[data-section-body-preview-image="true"]').length > 0,
    undefined,
    { timeout: 10000 },
  );

  expect(
    await page.locator('[data-section-body-preview-image="true"]').count(),
  ).toBeGreaterThan(0);

  expect(
    await page.locator('[data-section-body-preview-overlay]').count(),
  ).toBeGreaterThan(0);

  expect(
    await page.locator('[data-section-body-preview-overlay]').count(),
  ).toBeLessThan(totalPreviewRoots * 0.65);

  expect(
    await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-section-body-preview-root]"),
      ).some((root) =>
        Array.from(root.children).some(
          (child) => child instanceof HTMLElement && child.style.opacity === "0",
        ),
      ),
    ),
  ).toBe(true);

  await page.mouse.up();

  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-section-body-preview-image="true"]')
        .length === 0,
    undefined,
    { timeout: 10000 },
  );
});

async function panCanvas(
  page: Page,
  {
    deltaX,
    deltaY,
    keepMouseDown = false,
  }: {
    deltaX: number;
    deltaY: number;
    keepMouseDown?: boolean;
  },
): Promise<void> {
  const pane = page.locator(".react-flow__pane").first();
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Expected react-flow pane bounds.");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });

  if (!keepMouseDown) {
    await page.mouse.up();
  }
}
