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

test("json-render mode surfaces backend stream error details", async ({
  page,
}) => {
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
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Missing API key for app spec streaming.",
      }),
    });
  });

  await page.getByRole("button", { name: "Generate In Pane" }).click();
  await expect(
    page.getByText("Missing API key for app spec streaming."),
  ).toBeVisible();
});

test("json-render mode does not eager-load AI chat config until chat-backed modes", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "json_render",
  });

  let llmConfigCalls = 0;
  let apiKeyCalls = 0;
  let engineConfigCalls = 0;
  let externalAgentHealthCalls = 0;

  await page.route("**/api/llm/config", async (route) => {
    llmConfigCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configs: {} }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    apiKeyCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    engineConfigCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    externalAgentHealthCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();

  expect(llmConfigCalls).toBe(0);
  expect(apiKeyCalls).toBe(0);
  expect(engineConfigCalls).toBe(0);
  expect(externalAgentHealthCalls).toBe(0);

  await page.getByRole("button", { name: "Prompt Builder" }).click();

  await expect
    .poll(
      () =>
        llmConfigCalls +
        apiKeyCalls +
        engineConfigCalls +
        externalAgentHealthCalls,
    )
    .toBeGreaterThan(0);
});
