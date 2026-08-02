import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setChatSectionChatId,
} from "../helpers";
import { findSectionByName } from "./chat-composer-control-helpers";

test.describe.serial("chat composer history controls", () => {
  test("chat section history refreshes runs when the history panel opens", async ({
    page,
  }) => {
    let historySectionId: string | null = null;
    let historyProjectConfigId: string | null = null;
    let historyEngineConfigId: string | null = null;
    let historyRefreshArmed = false;
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      const runs =
        historyRefreshArmed &&
        historySectionId &&
        historyProjectConfigId &&
        historyEngineConfigId
          ? [
              {
                id: "run-history-refresh",
                profileId: null,
                status: "completed",
                startedAt: "2026-01-01T00:00:00Z",
                finishedAt: "2026-01-01T00:00:01Z",
                events: [],
                inputs: {
                  runType: "llm_chat",
                  projectConfigId: historyProjectConfigId,
                  chatId: "chat-history-refresh",
                  sectionId: historySectionId,
                  engineConfigId: historyEngineConfigId,
                  messages: [
                    {
                      id: "history-message-1",
                      role: "user",
                      content: [
                        { type: "text", text: "History refreshed entry" },
                      ],
                      attachments: [],
                    },
                  ],
                },
                outputs: {},
              },
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runs),
      });
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    historyProjectConfigId = projectContext.projectConfigId;
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      historyEngineConfigId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!historyEngineConfigId) {
        throw new Error(
          "Missing managed LLM engine config for history refresh.",
        );
      }
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_refresh__",
      );
      historySectionId = sectionId;
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: historyEngineConfigId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(
        section.getByRole("button", { name: "History" }),
      ).toBeVisible();
      const initialRequestCount = getAgentRunsRequestCount;
      historyRefreshArmed = true;
      await section.getByRole("button", { name: "History" }).click();
      await expect
        .poll(() => getAgentRunsRequestCount, { timeout: 15000 })
        .toBeGreaterThan(initialRequestCount);
      await expect(section.getByText("History refreshed entry")).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section exits history when external activity resumes the current managed thread", async ({
    page,
  }) => {
    const workflowChatId = "chat-history-workflow-current";
    let workflowSectionId: string | null = null;
    let workflowProjectConfigId: string | null = null;
    let workflowEngineConfigId: string | null = null;

    await page.route("**/api/getLLMChat", async (route) => {
      const payload = route.request().postDataJSON() as
        | { chatId?: string }
        | undefined;
      if (payload?.chatId !== workflowChatId) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: "workflow-history-message",
              role: "assistant",
              content: [
                { type: "text", text: "Workflow thread already selected." },
              ],
            },
          ],
          waitingForResponse: false,
          llmConfig: {
            id: "workflow-llm",
            model: "claude-3-7-sonnet-latest",
            provider: "anthropic",
            mcpServerIds: [],
          },
          contextUsage: null,
        }),
      });
    });

    await page.route("**/api/getAgentRuns", async (route) => {
      const runs =
        workflowSectionId && workflowProjectConfigId && workflowEngineConfigId
          ? [
              {
                id: "run-history-workflow-current",
                profileId: null,
                status: "completed",
                startedAt: "2026-02-10T00:00:00Z",
                finishedAt: "2026-02-10T00:00:02Z",
                events: [],
                inputs: {
                  runType: "llm_chat",
                  projectConfigId: workflowProjectConfigId,
                  chatId: workflowChatId,
                  sectionId: workflowSectionId,
                  engineConfigId: workflowEngineConfigId,
                  messages: [
                    {
                      id: "workflow-history-input",
                      role: "user",
                      content: [
                        { type: "text", text: "Resume workflow thread" },
                      ],
                      attachments: [],
                    },
                  ],
                },
                outputs: {
                  name: "Resume workflow thread",
                  nameSource: "llm",
                },
              },
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runs),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    workflowProjectConfigId = projectContext.projectConfigId;
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      workflowEngineConfigId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!workflowEngineConfigId) {
        throw new Error("Missing managed LLM engine config for workflow chat.");
      }

      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_workflow__",
      );
      workflowSectionId = sectionId;
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: workflowEngineConfigId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      await setChatSectionChatId(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        chatId: workflowChatId,
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(
        section.getByText("Workflow thread already selected."),
      ).toBeVisible();

      await section.getByRole("button", { name: "History" }).click();
      await expect(section.getByRole("button", { name: "Back" })).toBeVisible();
      await expect(section.getByText("Resume workflow thread")).toBeVisible();

      await page.evaluate(
        async ({ chatId }) => {
          const { useAIStore } = await import("/src/state/definitions.ts");
          useAIStore.setState((state) => ({
            chatDetails: {
              ...state.chatDetails,
              [chatId]: {
                messages: state.chatDetails[chatId]?.messages ?? [],
                toolCallArguments:
                  state.chatDetails[chatId]?.toolCallArguments ?? {},
                waitingForResponse: true,
                llmConfig: state.chatDetails[chatId]?.llmConfig ?? null,
                contextUsage: state.chatDetails[chatId]?.contextUsage ?? null,
              },
            },
          }));
        },
        { chatId: workflowChatId },
      );

      await expect(section.getByRole("button", { name: "Back" })).toHaveCount(
        0,
      );
      await expect(
        section.getByRole("button", { name: "History" }),
      ).toBeVisible();
      await expect(
        section.getByText("Workflow thread already selected."),
      ).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section refreshes the current managed thread when workflow activity updates the same chat id", async ({
    page,
  }) => {
    const workflowChatId = "chat-history-workflow-refresh";
    let workflowSectionId: string | null = null;
    let workflowProjectConfigId: string | null = null;
    let workflowEngineConfigId: string | null = null;
    let workflowRunActive = false;
    let workflowChatHydrationCount = 0;

    await page.route("**/api/getLLMChat", async (route) => {
      const payload = route.request().postDataJSON() as
        | { chatId?: string }
        | undefined;
      if (payload?.chatId !== workflowChatId) {
        await route.continue();
        return;
      }
      workflowChatHydrationCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: workflowRunActive
            ? [
                {
                  id: "workflow-refresh-user",
                  role: "user",
                  content: [{ type: "text", text: "Resume workflow thread" }],
                  attachments: [],
                },
                {
                  id: "workflow-refresh-assistant",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Workflow thread refreshed automatically.",
                    },
                  ],
                  attachments: [],
                },
              ]
            : [
                {
                  id: "workflow-baseline-message",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Workflow thread already selected.",
                    },
                  ],
                  attachments: [],
                },
              ],
          waitingForResponse: false,
          llmConfig: {
            id: "workflow-llm",
            model: "claude-3-7-sonnet-latest",
            provider: "anthropic",
            mcpServerIds: [],
          },
          contextUsage: null,
        }),
      });
    });

    await page.route("**/api/getAgentRuns", async (route) => {
      const runs =
        workflowRunActive &&
        workflowSectionId &&
        workflowProjectConfigId &&
        workflowEngineConfigId
          ? [
              {
                id: "run-history-workflow-refresh",
                profileId: null,
                status: "completed",
                startedAt: "2026-02-10T00:00:00Z",
                finishedAt: "2026-02-10T00:00:02Z",
                events: [],
                inputs: {
                  runType: "llm_chat",
                  projectConfigId: workflowProjectConfigId,
                  chatId: workflowChatId,
                  sectionId: workflowSectionId,
                  engineConfigId: workflowEngineConfigId,
                  messages: [
                    {
                      id: "workflow-history-input",
                      role: "user",
                      content: [
                        { type: "text", text: "Resume workflow thread" },
                      ],
                      attachments: [],
                    },
                  ],
                },
                outputs: {
                  name: "Resume workflow thread",
                  nameSource: "llm",
                },
              },
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runs),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    workflowProjectConfigId = projectContext.projectConfigId;
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      workflowEngineConfigId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!workflowEngineConfigId) {
        throw new Error("Missing managed LLM engine config for workflow chat.");
      }

      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_workflow_refresh__",
      );
      workflowSectionId = sectionId;
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: workflowEngineConfigId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      await setChatSectionChatId(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        chatId: workflowChatId,
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(
        section.getByText("Workflow thread already selected."),
      ).toBeVisible();
      expect(workflowChatHydrationCount).toBeGreaterThan(0);

      workflowRunActive = true;
      await page.evaluate(async () => {
        const { loadAgentRuns } = await import("/src/state/actions/ai.ts");
        await loadAgentRuns();
      });

      await expect(
        section.getByText("Workflow thread refreshed automatically."),
      ).toBeVisible();
      await expect
        .poll(() => workflowChatHydrationCount, { timeout: 15000 })
        .toBeGreaterThan(1);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section defers run history loading until history is opened", async ({
    page,
  }) => {
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const requestCountBeforeSection = getAgentRunsRequestCount;
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_lazy__",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await page.waitForTimeout(1200);
      expect(getAgentRunsRequestCount).toBe(requestCountBeforeSection);

      await section.getByRole("button", { name: "History" }).click();
      await expect
        .poll(() => getAgentRunsRequestCount, { timeout: 15000 })
        .toBeGreaterThan(requestCountBeforeSection);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section history avoids polling while all runs are idle", async ({
    page,
  }) => {
    let idleSectionId: string | null = null;
    let idleProjectConfigId: string | null = null;
    let idleEngineConfigId: string | null = null;
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      const runs =
        idleSectionId === null ||
        idleProjectConfigId === null ||
        idleEngineConfigId === null
          ? []
          : [
              {
                id: "run-history-idle",
                profileId: null,
                status: "completed",
                startedAt: "2026-02-01T00:00:00Z",
                finishedAt: "2026-02-01T00:00:01Z",
                events: [],
                inputs: {
                  runType: "llm_chat",
                  projectConfigId: idleProjectConfigId,
                  chatId: "chat-history-idle",
                  sectionId: idleSectionId,
                  engineConfigId: idleEngineConfigId,
                  messages: [
                    {
                      id: "history-idle-message",
                      role: "user",
                      content: [{ type: "text", text: "Idle history entry" }],
                      attachments: [],
                    },
                  ],
                },
                outputs: {},
              },
            ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runs),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    idleProjectConfigId = projectContext.projectConfigId;
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      idleEngineConfigId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!idleEngineConfigId) {
        throw new Error("Missing managed LLM engine config for idle history.");
      }
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_idle__",
      );
      idleSectionId = sectionId;
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: idleEngineConfigId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await section.getByRole("button", { name: "History" }).click();
      await expect(section.getByText("Idle history entry")).toBeVisible();
      const requestCountAfterOpen = getAgentRunsRequestCount;

      await page.waitForTimeout(6200);
      expect(getAgentRunsRequestCount).toBe(requestCountAfterOpen);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
