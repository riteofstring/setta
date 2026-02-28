import { expect, test, type Route } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

test("project ai hydrates external threads via external provenance endpoint", async ({
  page,
}) => {
  const externalChatId = "pw-external-provenance";
  let externalHydrateCalls = 0;
  let llmHydrateCalls = 0;
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-config-external",
          name: "External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-1",
          settaLlmConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === externalChatId) {
      externalHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-external-hydrated",
            role: "assistant",
            content: [
              { type: "text", text: "Hydrated from external endpoint." },
            ],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === externalChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "fallback-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          mcpServerIds: [],
        },
        contextUsage: null,
      }),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-external-provenance",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-10T00:00:00Z",
          finishedAt: "2026-01-10T00:00:02Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: externalChatId,
            engineConfigId: "engine-config-external",
            messages: [
              {
                id: "user-message-1",
                role: "user",
                content: [{ type: "text", text: "Open prior external thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "External provenance thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();
    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "External provenance thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect.poll(() => externalHydrateCalls).toBeGreaterThan(0);
    expect(llmHydrateCalls).toBe(0);
    await expect(
      overviewPane.getByText("Hydrated from external endpoint.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai blocks selected threads when persisted engine config is missing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const blockedChatId = "pw-llm-missing-engine";
  let llmHydrateCalls = 0;
  let llmSubmitCalls = 0;

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-config-llm",
          name: "Primary LLM Engine",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-llm-missing-engine",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-10T00:00:00Z",
          finishedAt: "2026-04-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: blockedChatId,
            engineConfigId: "engine-config-llm",
            messages: [
              {
                id: "blocked-user-1",
                role: "user",
                content: [{ type: "text", text: "Resume blocked thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Blocked provenance thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === blockedChatId) {
      llmHydrateCalls += 1;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            errorCode: "engine_config_missing",
            message: "Chat engine config is no longer available.",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "primary",
          model: "gpt-4o-mini",
          provider: "openai",
          mcpServerIds: [],
        },
        contextUsage: null,
      }),
    });
  });

  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === blockedChatId) {
      llmSubmitCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("unexpected-blocked-submit"),
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Blocked provenance thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    allowExpectedApiError(page, {
      path: "/api/getLLMChat",
      method: "POST",
      statuses: [409],
      count: 1,
    });
    await threadEntry.click();

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("engine config is no longer available");
    await expect(overviewPane.locator('button[type="submit"]').first()).toBeDisabled();
    await page.waitForTimeout(500);
    expect(llmSubmitCalls).toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai retries hydration after switching threads cancels a scheduled retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const engineConfigsResponse = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(engineConfigsResponse.ok()).toBe(true);
  const engineConfigs = (await engineConfigsResponse.json()) as Array<{
    id: string;
    engineType: string;
  }>;
  if (engineConfigs.length === 0) {
    throw new Error(
      "Expected at least one engine config for hydration retry test.",
    );
  }

  const retryChatIdPrefix = "pw-hydration-retry-";
  const siblingChatIdPrefix = "pw-hydration-sibling-";
  let retryHydrateCalls = 0;
  let siblingHydrateCalls = 0;
  const failedRetryChatIds = new Set<string>();

  const buildHydrationBody = (
    endpoint: "llm" | "external",
    text: string,
  ): Record<string, unknown> => {
    if (endpoint === "external") {
      return {
        messages: [
          {
            id: `assistant-${text}`,
            role: "assistant",
            content: [{ type: "text", text }],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      };
    }
    return {
      messages: [
        {
          id: `assistant-${text}`,
          role: "assistant",
          content: [{ type: "text", text }],
        },
      ],
      waitingForResponse: false,
      llmConfig: null,
      contextUsage: null,
    };
  };

  await page.route("**/api/getAgentRuns", async (route) => {
    const runs = engineConfigs.flatMap((config, index) => {
      const runType =
        config.engineType === "external_agent" ? "external_agent" : "llm_chat";
      const day = String(10 + index).padStart(2, "0");
      return [
        {
          id: `run-retry-${config.id}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-02-${day}T00:00:00Z`,
          finishedAt: `2026-02-${day}T00:00:01Z`,
          events: [],
          inputs: {
            runType,
            projectConfigId: projectContext.projectConfigId,
            chatId: `${retryChatIdPrefix}${config.id}`,
            engineConfigId: config.id,
            messages: [
              {
                id: `retry-user-${config.id}`,
                role: "user",
                content: [{ type: "text", text: "Retry target" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Retry target thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
        {
          id: `run-sibling-${config.id}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-02-${day}T00:00:02Z`,
          finishedAt: `2026-02-${day}T00:00:03Z`,
          events: [],
          inputs: {
            runType,
            projectConfigId: projectContext.projectConfigId,
            chatId: `${siblingChatIdPrefix}${config.id}`,
            engineConfigId: config.id,
            messages: [
              {
                id: `sibling-user-${config.id}`,
                role: "user",
                content: [{ type: "text", text: "Sibling target" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Sibling thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ];
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(runs),
    });
  });

  const handleHydrationRoute = async (
    route: Route,
    endpoint: "llm" | "external",
  ) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    const chatId = payload?.chatId ?? "";
    if (chatId.startsWith(retryChatIdPrefix)) {
      retryHydrateCalls += 1;
      if (!failedRetryChatIds.has(chatId)) {
        failedRetryChatIds.add(chatId);
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildHydrationBody(endpoint, "Retry chat hydrated after returning."),
        ),
      });
      return;
    }
    if (chatId.startsWith(siblingChatIdPrefix)) {
      siblingHydrateCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildHydrationBody(endpoint, "Sibling hydrated.")),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildHydrationBody(endpoint, "Unused hydration.")),
    });
  };

  await page.route("**/api/getLLMChat", async (route) => {
    await handleHydrationRoute(route, "llm");
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    await handleHydrationRoute(route, "external");
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const retryEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Retry target thread" })
      .first();
    const siblingEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Sibling thread" })
      .first();
    await expect(retryEntry).toBeVisible();
    await expect(siblingEntry).toBeVisible();

    await retryEntry.click();
    await expect.poll(() => retryHydrateCalls).toBe(1);

    await siblingEntry.click();
    await expect.poll(() => siblingHydrateCalls).toBeGreaterThan(0);

    // The first chat's retry timer should be canceled by thread switch, then recover on return.
    await page.waitForTimeout(1300);
    expect(retryHydrateCalls).toBe(1);

    await retryEntry.click();
    await expect.poll(() => retryHydrateCalls).toBeGreaterThan(1);
    await expect(
      overviewPane.getByText("Retry chat hydrated after returning.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai stops retrying hydration after terminal 404 failures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const terminalChatId = "pw-hydration-terminal-404";
  let terminalHydrateCalls = 0;

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-terminal-404",
          name: "Terminal Retry Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-terminal-404",
          settaLlmConfigId: null,
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-terminal-404",
          profileId: null,
          status: "completed",
          startedAt: "2026-03-10T00:00:00Z",
          finishedAt: "2026-03-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: terminalChatId,
            engineConfigId: "engine-terminal-404",
            messages: [
              {
                id: "terminal-user-1",
                role: "user",
                content: [{ type: "text", text: "Hydrate missing chat" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Terminal hydration thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === terminalChatId) {
      terminalHydrateCalls += 1;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Chat not found" }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Chat not found" }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Terminal hydration thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    allowExpectedApiError(page, {
      path: "/api/getExternalAgentChat",
      method: "POST",
      statuses: [404],
      count: 1,
    });
    await threadEntry.click();

    await expect.poll(() => terminalHydrateCalls).toBe(1);
    await page.waitForTimeout(3200);
    expect(terminalHydrateCalls).toBe(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai shows context unavailable when backend context telemetry is missing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const chatId = "pw-context-unavailable";

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-managed",
          name: "Managed External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-managed",
          settaLlmConfigId: null,
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-context-unavailable",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-10T00:00:00Z",
          finishedAt: "2026-01-10T00:00:02Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId,
            engineConfigId: "engine-managed",
            messages: [
              {
                id: "user-message-1",
                role: "user",
                content: [{ type: "text", text: "Check context telemetry" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Context unavailable thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId !== chatId) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          toolCallArguments: {},
          contextUsage: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-context-unavailable",
            role: "assistant",
            content: [
              { type: "text", text: "No context telemetry available." },
            ],
          },
        ],
        waitingForResponse: false,
        llmConfig: {
          id: "default-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: null,
          temporary: false,
        },
        contextUsage: null,
      }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "default-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: null,
          temporary: false,
        },
        contextUsage: {
          contextWindowTokens: 1000,
          contextUsedTokens: 100,
          estimated: false,
        },
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Context unavailable thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect(
      overviewPane.getByText("No context telemetry available.").first(),
    ).toBeVisible();
    await expect(overviewPane.getByLabel("context unavailable")).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
