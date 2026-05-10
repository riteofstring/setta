import { expect, test, type Page } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  ensureProjectChatThreadsPanelVisible,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

async function seedAIStore(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript((nextState) => {
    const key = "setta_ai_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state !== null
              ? (parsed.state as Record<string, unknown>)
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

async function bindVisibleProjectChatWindowToChatId(
  page: Page,
  chatId: string,
): Promise<void> {
  await page.evaluate(async (nextChatId: string) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const {
      ChatWindowPlacementEnum,
      createProjectChatWindowInstance,
      createProjectChatWindowingState,
    } = await import("/src/utils/generatedTypes.ts");
    useProjectState.setState((state) => {
      const firstWindowId =
        state.projectChatWindowing.order[0] ?? "project-chat-window-1";
      const current =
        state.projectChatWindowing.instancesById[firstWindowId] ?? null;
      if (!current) {
        state.projectChatWindowing = createProjectChatWindowingState({
          order: [firstWindowId],
          instancesById: {
            [firstWindowId]: createProjectChatWindowInstance({
              instanceId: firstWindowId,
              placement: ChatWindowPlacementEnum.bottom_docked,
              chatId: nextChatId,
              isMinimized: false,
            }),
          },
        });
        return;
      }
      state.projectChatWindowing.instancesById[firstWindowId] = {
        ...current,
        chatId: nextChatId,
        isMinimized: false,
      };
    });
  }, chatId);
}

function buildGetLLMResponseResponse(chatId: string) {
  return chatId;
}

test("project ai keeps composer usable when post-ready agent-runs refresh fails once after submit", async ({
  page,
}) => {
  const chatId = "pw-post-ready-transient-refresh";
  let llmSubmitCalls = 0;
  let llmHydrateCalls = 0;
  let agentRunsCalls = 0;
  let reloadStarted = false;
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
          id: "engine-config-llm",
          name: "Primary LLM Engine",
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
            api_key_env: "OPENAI_API_KEY",
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "primary",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiKeys: {
          OPENAI_API_KEY: "pw-openai-key",
        },
        revision: 1,
      }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    if (!reloadStarted) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }
    agentRunsCalls += 1;
    if (agentRunsCalls === 2) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "transient metadata refresh failure" }),
      });
      return;
    }
    if (agentRunsCalls >= 3) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-post-ready-transient-refresh",
            profileId: null,
            status: "completed",
            startedAt: "2026-07-20T00:00:00Z",
            finishedAt: "2026-07-20T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId,
              engineConfigId: "engine-config-llm",
              messages: [
                {
                  id: "post-ready-user-1",
                  role: "user",
                  content: [{ type: "text", text: "Start a chat thread" }],
                  attachments: [],
                },
              ],
            },
            outputs: {
              name: "Post-ready transient refresh",
              nameSource: "llm",
            },
            toolCalls: [],
            cost: null,
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getLLMResponse", async (route) => {
    llmSubmitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildGetLLMResponseResponse(chatId)),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === chatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: `assistant-post-ready-${llmHydrateCalls}`,
            role: "assistant",
            content: [
              { type: "text", text: "Hydrated after transient refresh." },
            ],
          },
        ],
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

  try {
    allowExpectedApiError(page, {
      path: "/api/getAgentRuns",
      statuses: [500],
      count: 1,
    });
    reloadStarted = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");
    const overviewPane = await getVisibleProjectChatSurface(page);
    const input = overviewPane.locator("textarea").first();
    const submitButton = overviewPane.locator('button[type="submit"]').first();
    await expect(input).toBeVisible();

    await input.fill("Trigger post-ready refresh failure.");
    await expect(submitButton).toBeEnabled();
    await input.press("Enter");

    await expect.poll(() => llmSubmitCalls).toBeGreaterThanOrEqual(1);
    await expect.poll(() => llmHydrateCalls).toBeGreaterThanOrEqual(1);
    await expect.poll(() => agentRunsCalls).toBeGreaterThanOrEqual(2);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);

    await input.fill("Second message should still submit.");
    await expect(submitButton).toBeEnabled();
    await input.press("Enter");
    await expect.poll(() => llmSubmitCalls).toBeGreaterThanOrEqual(2);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai retries transient metadata failures and hydrates after authority recovery", async ({
  page,
}) => {
  const staleChatId = "pw-stale-selected-chat-non-authoritative";
  let llmHydrateCalls = 0;
  let agentRunsCalls = 0;
  let reloadStarted = false;
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
    if (!reloadStarted) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }
    agentRunsCalls += 1;
    if (agentRunsCalls === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "agent run load failed" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-stale-selected-chat",
          profileId: null,
          status: "completed",
          startedAt: "2026-06-02T00:00:00Z",
          finishedAt: "2026-06-02T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: staleChatId,
            engineConfigId: "engine-config-llm",
            messages: [
              {
                id: "stale-user-1",
                role: "user",
                content: [{ type: "text", text: "Hydrate after retry" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Hydrate after authority retry",
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
    if (payload?.chatId === staleChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-hydrated-stale",
            role: "assistant",
            content: [{ type: "text", text: "Hydrated stale selected chat." }],
          },
        ],
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

  try {
    await seedAIStore(page, {
      activeChatId: staleChatId,
    });
    allowExpectedApiError(page, {
      path: "/api/getAgentRuns",
      statuses: [500],
      count: 1,
    });
    reloadStarted = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");
    const overviewPane = await getVisibleProjectChatSurface(page);
    await bindVisibleProjectChatWindowToChatId(page, staleChatId);

    await page.waitForTimeout(200);
    expect(agentRunsCalls).toBeGreaterThanOrEqual(1);
    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    expect(agentRunsCalls).toBeGreaterThanOrEqual(2);
    await expect(
      overviewPane.getByText("Hydrated stale selected chat.").first(),
    ).toBeVisible();
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai defers selected-thread hydration when engine config metadata is non-authoritative", async ({
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
  const chatId = "pw-hydrate-unknown-engine-cache";
  let llmHydrateCalls = 0;
  let engineConfigCalls = 0;

  await page.route("**/api/getEngineConfigs", async (route) => {
    engineConfigCalls += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "engine config load failed" }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-llm-cache-unknown",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-10T00:00:00Z",
          finishedAt: "2026-04-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId,
            engineConfigId: "engine-config-llm",
            messages: [
              {
                id: "seed-user",
                role: "user",
                content: [{ type: "text", text: "Hydrate me" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Hydrate despite cache miss",
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
    if (payload?.chatId === chatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-hydrated",
            role: "assistant",
            content: [{ type: "text", text: "Hydrated with unknown cache." }],
          },
        ],
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

  try {
    allowExpectedApiError(page, {
      path: "/api/getEngineConfigs",
      statuses: [500],
      count: 4,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    await ensureProjectChatThreadsPanelVisible(page);
    const threadEntry = overviewPane
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Hydrate despite cache miss" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await page.waitForTimeout(700);
    expect(llmHydrateCalls).toBe(0);
    await expect.poll(() => engineConfigCalls).toBeGreaterThan(0);
    await expect(
      overviewPane.getByText("Hydrated with unknown cache.").first(),
    ).toHaveCount(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai thread history excludes runs from other projects", async ({
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
          id: "run-project-local",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-10T00:00:00Z",
          finishedAt: "2026-04-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "chat-local",
            engineConfigId: "engine-config-llm",
            messages: [],
          },
          outputs: { name: "Local project thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
        {
          id: "run-project-foreign",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-11T00:00:00Z",
          finishedAt: "2026-04-11T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: "foreign-project-id",
            chatId: "chat-foreign",
            engineConfigId: "engine-config-llm",
            messages: [],
          },
          outputs: { name: "Foreign project thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(threadsPanel).toBeVisible();
    await expect(threadsPanel.getByText("Local project thread")).toBeVisible();
    await expect(threadsPanel.getByText("Foreign project thread")).toHaveCount(
      0,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
