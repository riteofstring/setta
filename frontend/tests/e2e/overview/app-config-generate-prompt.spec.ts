import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("prompt-builder mode sends hidden app generation request to chat", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "prompt_builder",
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "llm-primary": {
            id: "llm-primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "llm-primary",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        OPENAI_API_KEY: "pw-key",
      }),
    });
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-primary",
          name: "Primary",
          engineType: "setta_llm",
          settaLlmConfigId: "llm-primary",
          externalAgentConfigId: null,
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  const capturedRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    capturedRequests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();
  await page
    .getByLabel("Generation Prompt")
    .fill("Build a compact analytics dashboard with two cards.");

  await page.getByRole("button", { name: "Send To Chat" }).click();
  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();

  expect(capturedRequests.length).toBe(1);
  const request = capturedRequests[0];
  expect(request.appGenerationMode).toBe("prompt_builder");
  expect(request.appGenerationReferenceImageUrl).toBeNull();

  const message = request.message as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textContent = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  expect(textContent).toContain("App generation mode: prompt_builder");
  expect(textContent).toContain(
    "Build a compact analytics dashboard with two cards.",
  );
});

test("prompt-builder waits for in-flight resource loads and uses default managed config fallback", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "prompt_builder",
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "llm-default": {
            id: "llm-default",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "llm-default",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        OPENAI_API_KEY: "pw-key",
      }),
    });
  });

  let releaseEngineConfigs: (() => void) | null = null;
  const engineConfigsGate = new Promise<void>((resolve) => {
    releaseEngineConfigs = resolve;
  });
  let engineConfigsRequestCount = 0;
  await page.route("**/api/getEngineConfigs", async (route) => {
    engineConfigsRequestCount += 1;
    await engineConfigsGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-primary",
          name: "Primary",
          engineType: "setta_llm",
          settaLlmConfigId: null,
          externalAgentConfigId: null,
          defaults: { thinking: null },
        },
      ]),
    });
  });

  let releaseExternalHealth: (() => void) | null = null;
  const externalHealthGate = new Promise<void>((resolve) => {
    releaseExternalHealth = resolve;
  });
  let externalHealthRequestCount = 0;
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    externalHealthRequestCount += 1;
    await externalHealthGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  const capturedRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();
  await expect.poll(() => engineConfigsRequestCount).toBeGreaterThan(0);
  await expect.poll(() => externalHealthRequestCount).toBeGreaterThan(0);

  const sendButton = page.getByRole("button", { name: "Send To Chat" });
  await sendButton.click();
  expect(capturedRequests.length).toBe(0);

  releaseEngineConfigs?.();
  releaseExternalHealth?.();

  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();
  expect(capturedRequests.length).toBe(1);
  expect(capturedRequests[0].engineConfigId).toBe("engine-primary");
});

test("prompt-builder mode ignores stale reference-image context from image mode", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "json_render_with_image",
    appGenerationPrompt: "Build a compact analytics dashboard with two cards.",
    appGenerationReferenceImageUrl: "https://example.com/stale-reference.png",
    appGenerationReferenceImageNotes: "This should not leak to prompt builder.",
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "llm-primary": {
            id: "llm-primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "llm-primary",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        OPENAI_API_KEY: "pw-key",
      }),
    });
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-primary",
          name: "Primary",
          engineType: "setta_llm",
          settaLlmConfigId: "llm-primary",
          externalAgentConfigId: null,
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  const capturedRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    capturedRequests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();

  await page.getByRole("button", { name: "Prompt Builder" }).click();
  await expect(page.getByLabel("Reference image URL")).toHaveCount(0);

  await page.getByRole("button", { name: "Send To Chat" }).click();
  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();

  expect(capturedRequests.length).toBe(1);
  const request = capturedRequests[0];
  expect(request.appGenerationMode).toBe("prompt_builder");
  expect(request.appGenerationReferenceImageUrl).toBeNull();
  expect(request.appGenerationReferenceImageNotes).toBeNull();

  const message = request.message as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textContent = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  expect(textContent).not.toContain("Reference-image context:");
  expect(textContent).not.toContain("stale-reference.png");
});

test("prompt-builder mode surfaces backend hidden-generation error detail", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "prompt_builder",
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "llm-primary": {
            id: "llm-primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "llm-primary",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        OPENAI_API_KEY: "pw-key",
      }),
    });
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-primary",
          name: "Primary",
          engineType: "setta_llm",
          settaLlmConfigId: "llm-primary",
          externalAgentConfigId: null,
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getLLMResponse", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        detail:
          "Reference image notes exceed 5000 characters for app generation.",
      }),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();

  await page.getByRole("button", { name: "Send To Chat" }).click();
  await expect(
    page.getByText(
      "Reference image notes exceed 5000 characters for app generation.",
    ),
  ).toBeVisible();
});

test("prompt-builder mode clears stale in-pane patch counts from prior json-render runs", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "json_render",
    appGenerationPrompt: "Create a compact card.",
  });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  await page.route("**/api/streamAppSpec", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        '{"op":"set","path":"/root","value":"gen-root"}\n' +
        '{"op":"set","path":"/elements/gen-root","value":{"key":"gen-root","type":"Card","props":{"title":"Generated"},"children":[]}}\n',
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

  await page.route("**/api/getLLMResponse", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "llm-primary": {
            id: "llm-primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "llm-primary",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        OPENAI_API_KEY: "pw-key",
      }),
    });
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-primary",
          name: "Primary",
          engineType: "setta_llm",
          settaLlmConfigId: "llm-primary",
          externalAgentConfigId: null,
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.getByRole("button", { name: "Generate In Pane" }).click();
  await expect(page.getByText("applied 2 patches")).toBeVisible();

  await page.getByRole("button", { name: "Prompt Builder" }).click();
  await page.getByRole("button", { name: "Send To Chat" }).click();

  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();
  await expect(page.getByText(/applied 2 patches/)).toHaveCount(0);
});
