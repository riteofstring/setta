import { expect, test } from "@playwright/test";
import { openIsolatedProject } from "../helpers";

async function openProjectMenu(page: import("@playwright/test").Page) {
  await page.getByRole("menuitem", { name: "Project" }).click();
}

test("load and save-as modals list only saved project configs with thumbnails", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await openIsolatedProject(page);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await expect(
    page.getByText("Project Configs", { exact: true }),
  ).toBeVisible();

  const loadListRows = page.getByTestId("save-load-config-list-row");
  await expect(loadListRows.first()).toBeVisible();
  await loadListRows.first().click();
  await expect(page.getByRole("button", { name: "Load" })).toBeEnabled();

  await page.getByTestId("save-load-view-thumbnails").click();
  const loadCards = page.getByTestId("save-load-config-card");
  await expect(loadCards.first()).toBeVisible();
  await expect(loadCards.first().locator("svg")).toBeVisible();
  const firstLoadCardBox = await loadCards.first().boundingBox();
  const firstLoadPreviewBox = await page
    .getByTestId("save-load-config-preview")
    .first()
    .boundingBox();
  if (!firstLoadCardBox || !firstLoadPreviewBox) {
    throw new Error(
      "Expected save/load thumbnail card geometry to be available.",
    );
  }
  expect(firstLoadCardBox.height).toBeGreaterThan(180);
  expect(firstLoadCardBox.width).toBeLessThan(240);
  expect(firstLoadCardBox.width / firstLoadCardBox.height).toBeLessThan(2.2);
  expect(firstLoadPreviewBox.height).toBeGreaterThan(120);
  await page.getByTestId("save-load-view-list").click();
  await expect(loadListRows.first()).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();

  await openProjectMenu(page);
  await page
    .getByRole("menuitem", { name: /^Save As/ })
    .first()
    .click();
  await expect(page.getByText("Save Project Config As")).toBeVisible();
  await expect(page.getByPlaceholder("Project Config Name")).toBeVisible();

  const saveListRows = page.getByTestId("save-load-config-list-row");
  await expect(saveListRows.first()).toBeVisible();
  const pickedName = (await saveListRows.first().textContent())?.trim();
  await saveListRows.first().click();
  if (pickedName) {
    await expect(page.getByPlaceholder("Project Config Name")).toHaveValue(
      pickedName,
    );
  }

  await page.getByTestId("save-load-view-thumbnails").click();
  const saveCards = page.getByTestId("save-load-config-card");
  await expect(saveCards.first()).toBeVisible();
  await expect(saveCards.first().locator("svg")).toBeVisible();
  const firstSaveCardBox = await saveCards.first().boundingBox();
  if (!firstSaveCardBox) {
    throw new Error("Expected save-as thumbnail card geometry.");
  }
  expect(firstSaveCardBox.width).toBeLessThan(240);

  await page.getByTestId("save-load-view-list").click();
  await expect(saveListRows.first()).toBeVisible();
});

test("load modal keeps single-click as selection and opens on double click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await openIsolatedProject(page);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  await expect(page.getByText("Load Project Config")).toBeVisible();

  const firstRow = page.getByTestId("save-load-config-list-row").first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load" })).toBeEnabled();

  const rowCursor = await firstRow.evaluate(
    (el) => window.getComputedStyle(el).cursor,
  );
  expect(rowCursor).toBe("pointer");

  await firstRow.dblclick();
  await expect(page.getByText("Load Project Config")).toHaveCount(0);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  await page.getByTestId("save-load-view-thumbnails").click();
  const firstCard = page.getByTestId("save-load-config-card").first();
  await expect(firstCard).toBeVisible();

  const cardCursor = await firstCard.evaluate(
    (el) => window.getComputedStyle(el).cursor,
  );
  expect(cardCursor).toBe("pointer");
  await firstCard.click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await firstCard.dblclick();
  await expect(page.getByText("Load Project Config")).toHaveCount(0);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  const firstRowAgain = page.getByTestId("save-load-config-list-row").first();
  await expect(firstRowAgain).toBeVisible();
  await firstRowAgain.click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await firstRowAgain.dblclick();
  await expect(page.getByText("Load Project Config")).toHaveCount(0);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  await page.getByTestId("save-load-view-list").click();
  const firstRowInList = page.getByTestId("save-load-config-list-row").first();
  await expect(firstRowInList).toBeVisible();
  const rowCursorInList = await firstRowInList.evaluate(
    (el) => window.getComputedStyle(el).cursor,
  );
  expect(rowCursorInList).toBe("pointer");
  await firstRowInList.click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await firstRowInList.dblclick();
  await expect(page.getByText("Load Project Config")).toHaveCount(0);
});
