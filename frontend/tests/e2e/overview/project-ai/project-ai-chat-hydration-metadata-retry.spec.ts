import { expect, test, type Route } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  ensureProjectChatThreadsPanelVisible,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";
import {
  bindVisibleProjectChatWindowToChatId,
  openProjectAIChatSurface,
  selectProjectAIChatTab,
  seedAIStore,
} from "./project-ai-chat-hydration-provenance-helpers";

test("project ai waits for authoritative engine config metadata before hydrating a selected thread", async ({
  page,
}) => {
  const selectedChatId = "pw-selected-unknown-engine-config-authority";
  let llmHydrateCalls = 0;
  let releaseEngineConfigs: (() => void) | null = null;
  const engineConfigsReady = new Promise<void>((resolve) => {
    releaseEngineConfigs = resolve;
  });

  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
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
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await seedAIStore(page, {
    activeChatId: selectedChatId,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await engineConfigsReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-llm-authoritative",
          name: "Authoritative LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          primary: {
            id: "primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        },
        default_config_id: "primary",
        mcpServers: {},
      }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-selected-unknown-engine-config-authority",
          profileId: null,
          status: "completed",
          startedAt: "2026-06-01T00:00:00Z",
          finishedAt: "2026-06-01T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: selectedChatId,
            engineConfigId: "engine-llm-authoritative",
            messages: [
              {
                id: "selected-chat-engine-config-user-1",
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Resume selected thread after engine config loads",
                  },
                ],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Selected unknown engine config authority thread",
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
    if (payload?.chatId === selectedChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "selected-engine-config-assistant",
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Hydrated after engine config authority ready.",
              },
            ],
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
      }),
    });
  });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await selectProjectAIChatTab(page);
    await bindVisibleProjectChatWindowToChatId(page, selectedChatId);

    await page.waitForTimeout(600);
    expect(llmHydrateCalls).toBe(0);

    if (!releaseEngineConfigs) {
      throw new Error("Expected delayed getEngineConfigs gate to initialize.");
    }
    releaseEngineConfigs();

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    await expect
      .poll(async () => {
        return await page.evaluate(
          async ({ activeChatId }) => {
            const { useAIStore } = await import("/src/state/definitions.ts");
            const messages =
              useAIStore.getState().chatDetails[activeChatId]?.messages;
            return (
              messages?.some((message) =>
                message.content?.some(
                  (entry) =>
                    entry.type === "text" &&
                    entry.text ===
                      "Hydrated after engine config authority ready.",
                ),
              ) ?? false
            );
          },
          { activeChatId: selectedChatId },
        );
      })
      .toBe(true);
  } finally {
    releaseEngineConfigs?.();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai rehydrates after metadata revision changes clear a terminal hydration decision", async ({
  page,
}) => {
  const chatId = "pw-hydration-metadata-refresh";
  let externalHydrateCalls = 0;
  let metadataRevisionAdvanced = false;

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
          id: "engine-refresh-llm",
          name: "Refresh Primary LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
        {
          id: "engine-refresh-external",
          name: "Refresh External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-refresh",
          settaLlmConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          primary: {
            id: "primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        },
        default_config_id: "primary",
        mcpServers: {},
      }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    const finishedAt = metadataRevisionAdvanced
      ? "2026-06-10T00:00:05Z"
      : "2026-06-10T00:00:01Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-hydration-metadata-refresh",
          profileId: null,
          status: "completed",
          startedAt: "2026-06-10T00:00:00Z",
          finishedAt,
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId,
            engineConfigId: "engine-refresh-external",
            messages: [
              {
                id: "refresh-user-1",
                role: "user",
                content: [{ type: "text", text: "Resume this thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Metadata refresh thread",
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
    if (payload?.chatId === chatId) {
      externalHydrateCalls += 1;
      if (!metadataRevisionAdvanced) {
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
          messages: [
            {
              id: "refresh-assistant-1",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Recovered after metadata update.",
                },
              ],
            },
          ],
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
        messages: [],
        waitingForResponse: false,
        toolCallArguments: {},
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
        llmConfig: null,
        contextUsage: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await openProjectAIChatSurface(page);
    const overviewPane = await getVisibleProjectChatSurface(page);
    await ensureProjectChatThreadsPanelVisible(page);
    const threadEntry = overviewPane
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Metadata refresh thread" })
      .first();
    await expect(threadEntry).toBeVisible();

    allowExpectedApiError(page, {
      path: "/api/getExternalAgentChat",
      method: "POST",
      statuses: [409],
      count: 4,
    });
    await threadEntry.click();

    await expect.poll(() => externalHydrateCalls).toBeGreaterThan(0);
    const hydrateCallsBeforeRefresh = externalHydrateCalls;
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("terminal hydration error");

    metadataRevisionAdvanced = true;
    await page.evaluate(async () => {
      const { loadAgentRuns } = await import("/src/state/actions/ai.ts");
      await loadAgentRuns();
    });

    await expect
      .poll(() => externalHydrateCalls)
      .toBeGreaterThan(hydrateCallsBeforeRefresh);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);
    await expect(
      overviewPane.getByText("Recovered after metadata update.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai keeps the selected sibling thread stable until the retrying thread is revisited", async ({
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
  const engineCleanup = await ensureManagedChatEngine(page);

  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const engineConfigsResponse = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(engineConfigsResponse.ok()).toBe(true);
  const allEngineConfigs = (await engineConfigsResponse.json()) as Array<{
    id: string;
    engineType: string;
  }>;
  if (allEngineConfigs.length === 0) {
    throw new Error(
      "Expected at least one engine config for hydration retry test.",
    );
  }
  const engineConfigs = [allEngineConfigs[0]];

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
    await openProjectAIChatSurface(page);

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
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
    await expect.poll(() => retryHydrateCalls).toBeGreaterThan(0);
    const retryCallsBeforeSwitch = retryHydrateCalls;

    const threadsPanelAfterRetry =
      await ensureProjectChatThreadsPanelVisible(page);
    const siblingEntryAfterRetry = threadsPanelAfterRetry
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Sibling thread" })
      .first();
    await siblingEntryAfterRetry.click();
    await expect.poll(() => siblingHydrateCalls).toBeGreaterThan(0);

    // The sibling selection should remain authoritative in the visible pane
    // until the retrying thread is explicitly revisited.
    await page.waitForTimeout(1300);
    await expect(
      overviewPane.getByText("Sibling hydrated.").first(),
    ).toBeVisible();
    await expect(
      overviewPane.getByText("Retry chat hydrated after returning.").first(),
    ).toHaveCount(0);

    const threadsPanelAfterSibling =
      await ensureProjectChatThreadsPanelVisible(page);
    const retryEntryAfterSibling = threadsPanelAfterSibling
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Retry target thread" })
      .first();
    await retryEntryAfterSibling.click();
    await expect
      .poll(() => retryHydrateCalls)
      .toBeGreaterThan(retryCallsBeforeSwitch);
    await expect(
      overviewPane.getByText("Retry chat hydrated after returning.").first(),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
