import { expect, test } from "@playwright/test";

import {
  allowExpectedApiError,
  ensureAppReady,
  seedLocalStorage,
} from "../../helpers";

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

test("invalid persisted app-generation mode falls back to json-render at runtime", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "invalid_mode_from_storage",
    appGenerationPrompt: "Build a compact result card.",
  });

  const streamRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/streamAppSpec", async (route) => {
    streamRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        '{"op":"set","path":"/root","value":"gen-root"}\n' +
        '{"op":"set","path":"/elements/gen-root","value":{"key":"gen-root","type":"Card","props":{"title":"Fallback Mode"},"children":[]}}\n',
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

  await ensureAppReady(page);
  await expect(page.getByText("Mode: JSON Render.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate In Pane" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Generate In Pane" }).click();
  await expect(page.getByText("App generation completed.")).toBeVisible();

  expect(streamRequests).toHaveLength(1);
  expect(streamRequests[0]?.mode).toBe("json_render");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("setta_data");
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw) as {
          state?: { appGenerationMode?: unknown };
        };
        return parsed.state?.appGenerationMode ?? null;
      }),
    )
    .toBe("json_render");
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
  allowExpectedApiError(page, {
    path: "/api/streamAppSpec",
    statuses: [400],
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

  await page.route("**/api/loadSettings", async (route) => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      chatWindowing?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...settings,
        chatWindowing: {
          ...(settings.chatWindowing ?? {}),
          autoCreateInitialChat: false,
        },
      }),
    });
  });
  await page.route("**/api/loadProjectConfig", async (route) => {
    const response = await route.fetch();
    const projectState = (await response.json()) as {
      projectChatWindowing?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...projectState,
        projectChatWindowing: {
          order: [],
          instancesById: {},
        },
      }),
    });
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
      body: JSON.stringify({
        apiKeys: {},
        revision: 0,
      }),
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

test("streaming toggle is hidden for in-pane JSON modes and shown for chat-backed modes", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "json_render",
  });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();
  await expect(page.getByLabel("Streaming mode")).toHaveCount(0);

  await page.getByRole("button", { name: "Prompt Builder" }).click();
  await expect(page.getByLabel("Streaming mode")).toBeVisible();

  await page.getByRole("button", { name: "JSON + Image" }).click();
  await expect(page.getByLabel("Streaming mode")).toHaveCount(0);
});
