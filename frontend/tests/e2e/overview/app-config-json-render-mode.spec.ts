import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("json-render mode streams patches in-pane and persists generated spec", async ({
  page,
}) => {
  const title = `Pane Generated ${Date.now()}`;

  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "json_render",
    appGenerationPrompt: "Build a compact result card.",
  });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  await page.route("**/api/streamAppSpec", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        '{"op":"set","path":"/root","value":"gen-root"}\n' +
        `{"op":"set","path":"/elements/gen-root","value":{"key":"gen-root","type":"Card","props":{"title":"${title}","description":"Generated in pane."},"children":[]}}\n`,
    });
  });

  await page.route("**/api/setAppDefinition", async (route) => {
    const payload = route.request().postDataJSON() as {
      appSpec: unknown;
      catalogId?: string;
      appSpecVersion?: string;
      appSpecPath?: string;
      theme?: unknown;
      assets?: unknown;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        appSpec: payload.appSpec,
        appDefinition: {
          catalogId: payload.catalogId ?? "setta.app.default",
          appSpecVersion: payload.appSpecVersion ?? "v1",
          appSpecPath: payload.appSpecPath ?? "app_specs/app.json",
          routes: [],
          dataBindings: {},
          actions: {},
          theme: payload.theme ?? null,
          assets: payload.assets ?? [],
        },
      }),
    });
  });

  const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
  if (await showPreviewButton.isVisible()) {
    await showPreviewButton.click();
  }

  await page.getByRole("button", { name: "Generate In Pane" }).click();

  await expect(page.getByText("App generation completed.")).toBeVisible();
  await expect(page.getByText("applied 2 patches")).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByLabel("App Spec JSON")).toContainText(title);
});
