import { expect, test, type Page, type Route } from "@playwright/test";
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

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
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

test("project ai resolves selected-thread provenance from project scope when chat ids overlap", async ({
  page,
}) => {
  const sharedChatId = "pw-shared-scope-chat-id";
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
          id: "engine-config-llm",
          name: "Primary LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
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
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-shared-project",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-10T00:00:00Z",
          finishedAt: "2026-01-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: sharedChatId,
            engineConfigId: "engine-config-llm",
            messages: [
              {
                id: "shared-user-project",
                role: "user",
                content: [{ type: "text", text: "Project thread message" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Project scoped thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
        {
          id: "run-shared-section",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-11T00:00:00Z",
          finishedAt: "2026-01-11T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            sectionId: "section-overlap",
            chatId: sharedChatId,
            engineConfigId: "engine-config-external",
            messages: [
              {
                id: "shared-user-section",
                role: "user",
                content: [{ type: "text", text: "Section thread message" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Section scoped thread",
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
    if (payload?.chatId === sharedChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-scoped-provenance",
            role: "assistant",
            content: [{ type: "text", text: "Hydrated from project scope." }],
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
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === sharedChatId) {
      externalHydrateCalls += 1;
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

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(threadsPanel).toBeVisible();
    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Project scoped thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    expect(externalHydrateCalls).toBe(0);
    await expect(
      overviewPane.getByText("Hydrated from project scope.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai keeps selected threads usable when hydration reports terminal metadata errors", async ({
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
        body: JSON.stringify(
          buildGetLLMResponseResponse("unexpected-blocked-submit"),
        ),
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
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
      count: 4,
    });
    await threadEntry.click();

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("terminal hydration error");
    const input = overviewPane.locator("textarea").first();
    await input.fill("Continue despite hydration warning");
    await expect(
      overviewPane.locator('button[type="submit"]').first(),
    ).toBeEnabled();
    await input.press("Enter");
    await expect.poll(() => llmSubmitCalls).toBe(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai waits for authoritative provenance before hydrating a selected thread", async ({
  page,
}) => {
  const selectedChatId = "pw-selected-unknown-provenance";
  let llmHydrateCalls = 0;
  let externalHydrateCalls = 0;
  let releaseAgentRuns: (() => void) | null = null;

  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await seedAIStore(page, {
    activeChatId: selectedChatId,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-llm-fallback",
          name: "Fallback LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
        {
          id: "engine-external-authoritative",
          name: "Authoritative External",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-authoritative",
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
    if (releaseAgentRuns === null) {
      await new Promise<void>((resolve) => {
        releaseAgentRuns = resolve;
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-selected-unknown-provenance",
          profileId: null,
          status: "completed",
          startedAt: "2026-05-10T00:00:00Z",
          finishedAt: "2026-05-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: selectedChatId,
            engineConfigId: "engine-external-authoritative",
            messages: [
              {
                id: "selected-chat-user-1",
                role: "user",
                content: [{ type: "text", text: "Resume selected thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Selected unknown provenance thread",
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
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
      }),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === selectedChatId) {
      externalHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "selected-chat-assistant",
            role: "assistant",
            content: [
              { type: "text", text: "Hydrated after provenance ready." },
            ],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const overviewPane = await getVisibleProjectChatSurface(page);
    await bindVisibleProjectChatWindowToChatId(page, selectedChatId);

    await page.waitForTimeout(600);
    expect(llmHydrateCalls).toBe(0);
    expect(externalHydrateCalls).toBe(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);

    if (!releaseAgentRuns) {
      throw new Error("Expected delayed getAgentRuns request to initialize.");
    }
    releaseAgentRuns();

    await expect.poll(() => externalHydrateCalls).toBeGreaterThan(0);
    expect(llmHydrateCalls).toBe(0);
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
                    entry.text === "Hydrated after provenance ready.",
                ),
              ) ?? false
            );
          },
          { activeChatId: selectedChatId },
        );
      })
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai does not warn on ambiguous local provenance before authority is ready", async ({
  page,
}) => {
  const selectedChatId = "pw-selected-ambiguous-local-provenance";
  let llmHydrateCalls = 0;
  let externalHydrateCalls = 0;
  let releaseAgentRuns: (() => void) | null = null;

  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await seedAIStore(page, {
    activeChatId: selectedChatId,
    agentRunsAuthorityState: "loading",
    agentRunsInitialLoadComplete: false,
    agentRunsLoadError: null,
    agentRuns: [
      {
        id: "run-ambiguous-local-llm",
        profileId: null,
        status: "completed",
        startedAt: "2026-05-20T00:00:00Z",
        finishedAt: "2026-05-20T00:00:02Z",
        events: [],
        inputs: {
          runType: "llm_chat",
          projectConfigId: projectContext.projectConfigId,
          chatId: selectedChatId,
          engineConfigId: "engine-llm-ambiguous",
          messages: [
            {
              id: "ambiguous-user-llm",
              role: "user",
              content: [
                { type: "text", text: "Resume ambiguous thread (LLM)" },
              ],
              attachments: [],
            },
          ],
        },
        outputs: {
          name: "Ambiguous local provenance thread",
          nameSource: "llm",
        },
        toolCalls: [],
        cost: null,
      },
      {
        id: "run-ambiguous-local-external",
        profileId: null,
        status: "completed",
        startedAt: "2026-05-20T00:00:00Z",
        finishedAt: "2026-05-20T00:00:02Z",
        events: [],
        inputs: {
          runType: "external_agent",
          projectConfigId: projectContext.projectConfigId,
          chatId: selectedChatId,
          engineConfigId: "engine-external-ambiguous",
          messages: [
            {
              id: "ambiguous-user-external",
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Resume ambiguous thread (External)",
                },
              ],
              attachments: [],
            },
          ],
        },
        outputs: {
          name: "Ambiguous local provenance thread",
          nameSource: "llm",
        },
        toolCalls: [],
        cost: null,
      },
    ],
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-llm-ambiguous",
          name: "Ambiguous LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
        {
          id: "engine-external-ambiguous",
          name: "Ambiguous External",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: "external-ambiguous",
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
    if (releaseAgentRuns === null) {
      await new Promise<void>((resolve) => {
        releaseAgentRuns = resolve;
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-ambiguous-authoritative-llm",
          profileId: null,
          status: "completed",
          startedAt: "2026-05-20T00:00:00Z",
          finishedAt: "2026-05-20T00:00:02Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: selectedChatId,
            engineConfigId: "engine-llm-ambiguous",
            messages: [
              {
                id: "ambiguous-authoritative-user-llm",
                role: "user",
                content: [
                  { type: "text", text: "Authoritative ambiguous (LLM)" },
                ],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Ambiguous local provenance thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
        {
          id: "run-ambiguous-authoritative-external",
          profileId: null,
          status: "completed",
          startedAt: "2026-05-20T00:00:00Z",
          finishedAt: "2026-05-20T00:00:02Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: selectedChatId,
            engineConfigId: "engine-external-ambiguous",
            messages: [
              {
                id: "ambiguous-authoritative-user-external",
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Authoritative ambiguous (External)",
                  },
                ],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Ambiguous local provenance thread",
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
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
      }),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === selectedChatId) {
      externalHydrateCalls += 1;
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

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const overviewPane = await getVisibleProjectChatSurface(page);
    await bindVisibleProjectChatWindowToChatId(page, selectedChatId);

    await page.waitForTimeout(600);
    expect(llmHydrateCalls).toBe(0);
    expect(externalHydrateCalls).toBe(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);

    if (!releaseAgentRuns) {
      throw new Error("Expected delayed getAgentRuns request to initialize.");
    }
    releaseAgentRuns();

    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("missing provenance metadata");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

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
    await page.waitForSelector(".react-flow__pane");
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
          id: "engine-refresh-external",
          name: "Refresh External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-refresh",
          settaLlmConfigId: null,
        },
      ]),
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
    await page.waitForSelector(".react-flow__pane");
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
    await page.waitForSelector(".react-flow__pane");

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
