import { expect, test } from "@playwright/test";

import { ensureAppReady, postBackend, seedLocalStorage } from "../../helpers";

type AppDefinitionResponse = {
  appSpec: unknown | null;
  appDefinition: unknown | null;
};

test("app config pane can save a default spec and show preview", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(
    page.getByRole("heading", { name: "JSON Render" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create Default" }).click();
  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  const response = await postBackend<AppDefinitionResponse>(
    page,
    "/getAppDefinition",
    {},
  );
  expect(response?.appSpec).not.toBeNull();

  const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
  if (await showPreviewButton.isVisible()) {
    await showPreviewButton.click();
  }

  await expect(page.getByText("App Preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inputs" })).toBeVisible();
});

test("app config keeps chat-owned generation controls out of the default workbench surface", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(
    page.getByRole("heading", { name: "JSON Render" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show Preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Default" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Validate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByLabel("App Spec JSON")).toBeVisible();
  await expect(
    page.getByText(
      "Use Project Chat slash commands like /app-json, /app-image, /app-prompt, and /app-mcp to initiate generation.",
    ),
  ).toBeVisible();

  await expect(page.getByLabel("Generation Prompt")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "JSON Render" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Prompt Builder" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send To Chat" })).toHaveCount(
    0,
  );

  const advancedToggle = page.getByRole("button", { name: "Advanced" });
  await expect(advancedToggle).toBeVisible();
  await expect(page.getByLabel("Catalog ID")).toHaveCount(0);
  await expect(page.getByLabel("Theme JSON")).toHaveCount(0);

  await advancedToggle.click();

  await expect(page.getByLabel("Catalog ID")).toBeVisible();
  await expect(page.getByLabel("Spec version")).toBeVisible();
  await expect(page.getByLabel("Theme mode")).toBeVisible();
  await expect(page.getByLabel("Spec path")).toBeVisible();
  await expect(page.getByLabel("Preview config")).toBeVisible();
  await expect(page.getByLabel("Theme JSON")).toBeVisible();
  await expect(page.getByLabel("Assets JSON")).toBeVisible();
});
