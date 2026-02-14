import { expect, test } from "@playwright/test";
import { openIsolatedProject } from "../helpers";

async function openProjectMenu(page: import("@playwright/test").Page) {
  await page.getByRole("menuitem", { name: "Project" }).click();
}

test("load and save-as modals list only saved project configs with thumbnails", async ({
  page,
}) => {
  await openIsolatedProject(page);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await expect(page.getByText("Project Configs", { exact: true })).toBeVisible();

  const loadCards = page.getByTestId("save-load-config-card");
  await expect(loadCards.first()).toBeVisible();
  await expect(loadCards.first().locator("svg")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Save As/ }).first().click();
  await expect(page.getByText("Save Project Config As")).toBeVisible();
  await expect(page.getByPlaceholder("Project Config Name")).toBeVisible();

  const saveCards = page.getByTestId("save-load-config-card");
  await expect(saveCards.first()).toBeVisible();
  await expect(saveCards.first().locator("svg")).toBeVisible();

  const pickedName = (
    await saveCards.first().locator("p").first().textContent()
  )?.trim();
  await saveCards.first().click();
  if (pickedName) {
    await expect(page.getByPlaceholder("Project Config Name")).toHaveValue(
      pickedName,
    );
  }
});
