import { expect, test } from "@playwright/test";
import { openIsolatedProject } from "../helpers";

async function openProjectMenu(page: import("@playwright/test").Page) {
  await page.getByRole("menuitem", { name: "Project" }).click();
}

test("load and save-as modals render the shared file browser UI", async ({
  page,
}) => {
  await openIsolatedProject(page);

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Load/ }).click();
  await expect(page.getByText("Load Project Config")).toBeVisible();
  await expect(page.locator('[id^=\"CodeMirror-FileBrowserFilter-\"]')).toBeVisible();
  await expect(page.getByText("Files", { exact: true })).toBeVisible();
  await expect(page.getByText("Date modified", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await openProjectMenu(page);
  await page.getByRole("menuitem", { name: /^Save As/ }).first().click();
  await expect(page.getByText("Save Project Config As")).toBeVisible();
  await expect(page.locator('[id^=\"CodeMirror-FileBrowserFilter-\"]')).toBeVisible();

  const firstExistingName = page.locator(
    'section:has-text(\"Existing Config Names\") button',
  );
  await expect(firstExistingName.first()).toBeVisible();
  const pickedName = (await firstExistingName.first().textContent())?.trim();
  await firstExistingName.first().click();
  if (pickedName) {
    await expect(page.getByPlaceholder("Project Config Name")).toHaveValue(
      pickedName,
    );
  }
});
