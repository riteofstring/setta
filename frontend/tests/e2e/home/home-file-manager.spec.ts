import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const HOME_URL = new URL("/home", BASE_URL).toString();

test("home page renders the three-column file manager layout", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("home-file-manager-layout")).toBeVisible();
  await expect(
    page.getByTestId("home-file-browser-column").first(),
  ).toBeVisible();
  await expect(page.getByTestId("home-project-gallery").first()).toBeVisible();
  await expect(
    page.getByTestId("home-selected-project-details").first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("home-left-column-resize-handle").first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("home-right-column-resize-handle").first(),
  ).toBeVisible();

  const galleryPane = page.getByTestId("home-project-gallery").first();
  const detailsPane = page.getByTestId("home-selected-project-details").first();
  const rightResizeHandle = page
    .getByTestId("home-right-column-resize-handle")
    .first();
  const galleryBeforeResize = await galleryPane.boundingBox();
  const detailsBeforeResize = await detailsPane.boundingBox();
  const rightHandleBox = await rightResizeHandle.boundingBox();
  if (!galleryBeforeResize || !detailsBeforeResize || !rightHandleBox) {
    throw new Error(
      "Expected desktop home layout panes to have bounding boxes.",
    );
  }
  expect(galleryBeforeResize.width).toBeGreaterThan(420);
  expect(
    Math.abs(galleryBeforeResize.height - detailsBeforeResize.height),
  ).toBeLessThan(4);

  const resizeStartX = rightHandleBox.x + rightHandleBox.width / 2;
  const resizeStartY = rightHandleBox.y + rightHandleBox.height / 2;
  await page.mouse.move(resizeStartX, resizeStartY);
  await page.mouse.down();
  await page.mouse.move(resizeStartX - 80, resizeStartY, { steps: 12 });
  await page.mouse.up();

  const galleryAfterResize = await galleryPane.boundingBox();
  const detailsAfterResize = await detailsPane.boundingBox();
  if (!galleryAfterResize || !detailsAfterResize) {
    throw new Error(
      "Expected resized home layout panes to have bounding boxes.",
    );
  }
  const rightEdgeBefore = detailsBeforeResize.x + detailsBeforeResize.width;
  const rightEdgeAfter = detailsAfterResize.x + detailsAfterResize.width;
  expect(Math.abs(rightEdgeAfter - rightEdgeBefore)).toBeLessThan(4);
  expect(detailsAfterResize.x).toBeLessThan(detailsBeforeResize.x);
  expect(galleryAfterResize.width).toBeGreaterThan(420);
  expect(
    Math.abs(galleryAfterResize.height - detailsAfterResize.height),
  ).toBeLessThan(4);

  const firstCard = page.getByTestId("home-project-card").first();
  await expect(firstCard).toBeVisible();
  const firstCardBox = await firstCard.boundingBox();
  if (!firstCardBox) {
    throw new Error("Expected the first home project card bounding box.");
  }
  expect(firstCardBox.width).toBeLessThan(240);
  const firstCardName = (
    await firstCard.locator("p").first().textContent()
  )?.trim();
  if (firstCardName) {
    await expect(
      page.getByTestId("home-selected-project-details").first(),
    ).toContainText(firstCardName);
  }

  await page.getByTestId("home-project-view-list").first().click();
  await expect(page.getByTestId("home-project-list").first()).toBeVisible();
  await expect(page.getByTestId("home-project-list-row").first()).toBeVisible();
  await page.getByTestId("home-project-view-thumbnails").first().click();
  await expect(page.getByTestId("home-project-card").first()).toBeVisible();

  const favoriteToggle = page
    .getByTestId("home-project-favorite-toggle")
    .first();
  await expect(favoriteToggle).toBeVisible();
  await favoriteToggle.click();
  await expect(
    page.getByTestId("home-project-favourites-section").first(),
  ).toBeVisible();
});

test("home browser marks Setta-initialized folders", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for home browser test.");
  }

  const tempRoot = await fs.mkdtemp(
    path.join(workspaceRoot, "setta-home-browser-"),
  );
  const initializedFolder = path.join(tempRoot, "initialized-folder");
  const plainFolder = path.join(tempRoot, "plain-folder");
  await fs.mkdir(path.join(initializedFolder, "setta_files"), {
    recursive: true,
  });
  await fs.mkdir(plainFolder, { recursive: true });

  try {
    await ensureAppReady(page);
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

    const pathInput = page.getByTestId("home-file-browser-path-input").first();
    await expect(pathInput).toBeVisible();
    await pathInput.fill(tempRoot);
    await pathInput.press("Enter");

    const initializedRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "initialized-folder" })
      .first();
    const plainRow = page
      .getByTestId("file-browser-row")
      .filter({ hasText: "plain-folder" })
      .first();

    await expect(initializedRow).toBeVisible();
    await expect(
      initializedRow.getByTestId("setta-initialized-badge"),
    ).toBeVisible();
    await expect(plainRow).toBeVisible();
    await expect(plainRow.getByTestId("setta-initialized-badge")).toHaveCount(
      0,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("home project items select on single click and open on double click", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  const firstCard = page.getByTestId("home-project-card").first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page).toHaveURL(HOME_URL);

  const cardCursor = await firstCard.evaluate(
    (el) => window.getComputedStyle(el).cursor,
  );
  expect(cardCursor).not.toBe("pointer");

  await firstCard.dblclick();
  await expect(page).not.toHaveURL(HOME_URL);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-project-view-list").first().click();
  const firstRow = page.getByTestId("home-project-list-row").first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page).toHaveURL(HOME_URL);

  const listRowCursor = await firstRow.evaluate(
    (el) => window.getComputedStyle(el).cursor,
  );
  expect(listRowCursor).not.toBe("pointer");

  await firstRow.dblclick();
  await expect(page).not.toHaveURL(HOME_URL);
});
