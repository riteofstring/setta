import { expect, test } from "@playwright/test";

import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";
import {
  buildAppGenSkillsResponse,
  buildGetLLMResponseResponse,
  getVisibleProjectChatAuxTestId,
  mockMixedSlashCommandEngines,
  openSkillsViewer,
  openSlashCommandsViewer,
  seedAIStore,
} from "./project-ai-chat-skills-mcp-viewer-helpers";

test("project ai chat only fetches agent runs for slash commands", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let getAgentRunsRequests = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-setta-e2e",
          name: "Setta LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "e2e-llm",
          externalAgentConfigId: null,
          defaults: {},
        },
        {
          id: "engine-external-e2e",
          name: "Codex",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: "external-codex",
          defaults: {},
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
          "e2e-llm": {
            id: "e2e-llm",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "e2e-llm",
        codexMcpImportedAt: null,
      }),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmConfigPath: "",
        activeSettaFilesLocation: "local",
        servers: [],
        externalServers: [],
      }),
    });
  });

  await ensureAppReady(page);
  await page.waitForTimeout(1200);
  const baselineRequestCount = getAgentRunsRequests;
  await openSkillsViewer(page);
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-skills-view"),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  expect(getAgentRunsRequests).toBe(baselineRequestCount);

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-aux-tab-mcp",
  ).click();
  await expect(
    getVisibleProjectChatAuxTestId(page, "project-chat-mcp-content"),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  expect(getAgentRunsRequests).toBe(baselineRequestCount);

  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-aux-tab-slash-commands",
  ).click();
  await expect(page.getByTestId("skills-mcp-slash-tab").first()).toBeVisible();
  await expect
    .poll(() => getAgentRunsRequests, { timeout: 15000 })
    .toBeGreaterThan(baselineRequestCount);
});

test("project ai chat ignores stale native slash local storage from other projects", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  const { externalEngine } = await mockMixedSlashCommandEngines(page);

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 2500);
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.evaluate(
      ({ externalEngineId }) => {
        window.localStorage.setItem(
          "setta.projectChatSkillsMcpViewer.agentNativeSlashCommandsByProjectConfigId",
          JSON.stringify({
            "project-other": {
              [externalEngineId]: {
                commands: ["/ship"],
                status: "available",
                statusDetail: null,
              },
            },
          }),
        );
      },
      {
        externalEngineId: externalEngine.id,
      },
    );
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await openSlashCommandsViewer(page);
    const externalEngineTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(externalEngineTab).toBeVisible();
    await externalEngineTab.click();

    const customCommandInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-command-input",
    );
    const customPromptInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-prompt-input",
    );
    const customAddButton = projectChatSurface.getByTestId(
      "project-chat-custom-slash-add",
    );

    await customCommandInput.fill("/ship");
    await customPromptInput.fill("Summarize project health.");
    await expect
      .poll(async () => await customAddButton.isEnabled(), { timeout: 10_000 })
      .toBe(true);
    await customAddButton.click();
    await expect(
      projectChatSurface
        .getByTestId("project-chat-custom-slash-command")
        .filter({
          hasText: "/ship",
        }),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat keeps native slash commands unavailable after terminal run-load failure", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  const { externalEngine } = await mockMixedSlashCommandEngines(page);
  allowExpectedApiError(page, {
    path: "/api/getAgentRuns",
    statuses: [500],
    method: "GET",
    count: 12,
    ttlMs: 20_000,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  let getAgentRunsRequests = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "forced failure" }),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await openSlashCommandsViewer(page);
    const externalEngineTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(externalEngineTab).toBeVisible();
    await externalEngineTab.click();

    const deployCommand = page
      .getByTestId("skills-mcp-agent-slash-command")
      .filter({ hasText: "/deploy" });
    await expect(deployCommand).toHaveCount(0);
    await expect(
      page.getByText(
        "Native command metadata is unavailable until agent metadata reloads for this project.",
      ),
    ).toBeVisible();

    await expect
      .poll(() => getAgentRunsRequests, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(4);
    await expect(deployCommand).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat blocks custom slash creation until native command authority is ready", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  const { externalEngine } = await mockMixedSlashCommandEngines(page);

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.route("**/api/getAgentRuns", async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 2500);
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-native-commands",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-02T00:00:00Z",
            finishedAt: "2026-02-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "external_agent",
              projectConfigId: projectContext.projectConfigId,
              chatId: "native-chat",
              engineConfigId: externalEngine.id,
              messages: [],
            },
            outputs: {
              metadata: {
                engineConfigId: externalEngine.id,
                agentNativeSlashCommands: ["/deploy"],
              },
            },
          },
        ]),
      });
    });
    await seedAIStore(page, {
      agentRunsAuthorityState: "terminal_error",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: "Failed to load agent runs",
    });
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await openSlashCommandsViewer(page);
    const externalEngineTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(externalEngineTab).toBeVisible();
    await externalEngineTab.click();

    await projectChatSurface
      .getByTestId("project-chat-custom-slash-command-input")
      .fill("/deploy");
    await projectChatSurface
      .getByTestId("project-chat-custom-slash-prompt-input")
      .fill("Deploy the current build.");

    await expect(
      projectChatSurface.getByText(
        "Command names stay disabled until native command authority is loaded for this project.",
      ),
    ).toBeVisible();
    const addButton = projectChatSurface.getByTestId(
      "project-chat-custom-slash-add",
    );
    await expect(addButton).toBeDisabled();

    await expect
      .poll(async () => await addButton.isDisabled(), { timeout: 10_000 })
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat reloads unresolved native slash commands once authority becomes ready", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  const { externalEngine } = await mockMixedSlashCommandEngines(page);

  if (!externalEngine.externalAgentConfigId) {
    throw new Error(
      "Missing external agent config id for cached native slash submit test.",
    );
  }

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: externalEngine.externalAgentConfigId,
          name: externalEngine.name,
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          nodePath: null,
          nodeVersion: null,
          sdkVersion: null,
          cliVersion: "0.0.0",
          baseUrl: null,
          workingDir: null,
          envVars: {
            present: [],
            missing: [],
          },
        },
      ]),
    });
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    let releaseAgentRuns: (() => void) | null = null;
    const agentRunsGate = new Promise<void>((resolve) => {
      releaseAgentRuns = resolve;
    });
    let getAgentRunsRequests = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequests += 1;
      await agentRunsGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-native-commands",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-02T00:00:00Z",
            finishedAt: "2026-02-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "external_agent",
              projectConfigId: projectContext.projectConfigId,
              chatId: "native-chat",
              engineConfigId: externalEngine.id,
              messages: [],
            },
            outputs: {
              metadata: {
                engineConfigId: externalEngine.id,
                agentNativeSlashCommands: ["/deploy"],
              },
            },
          },
        ]),
      });
    });

    let llmResponseRequests = 0;
    let submittedMessageText: string | null = null;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmResponseRequests += 1;
      const payload = route.request().postDataJSON() as {
        message?: {
          content?: Array<{
            text?: string;
          }>;
        };
      };
      submittedMessageText = payload.message?.content?.[0]?.text ?? null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildGetLLMResponseResponse("native-chat")),
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

    await seedAIStore(page, {
      agentRunsAuthorityState: "terminal_error",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: "Failed to load agent runs",
      projectChatSelectedEngineId: externalEngine.id,
    });

    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const input = projectChatSurface.getByTestId("chat-input-textarea");
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
    await input.fill("/deploy now");
    await projectChatSurface.getByLabel("Send message").click();

    await expect
      .poll(() => getAgentRunsRequests, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    expect(llmResponseRequests).toBe(0);
    await expect(input).toHaveValue("/deploy now");

    releaseAgentRuns?.();

    await expect.poll(() => llmResponseRequests, { timeout: 10_000 }).toBe(1);
    expect(submittedMessageText).toBe("/deploy now");
    await expect(page.getByText("Submitted /deploy")).toBeVisible();
    await expect(input).toHaveValue("");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat retries slash-command authority for mixed-engine projects without switching tabs", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  const {
    llmEngine,
    externalEngine,
    engineConfigs: sortedEngineConfigs,
  } = await mockMixedSlashCommandEngines(page);

  allowExpectedApiError(page, {
    path: "/api/getAgentRuns",
    statuses: [500],
    method: "GET",
    count: 1,
    ttlMs: 20_000,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAppGenSkillsResponse([])),
    });
  });

  let currentProjectConfigId: string | null = null;
  let getAgentRunsRequests = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequests += 1;
    if (getAgentRunsRequests === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "transient failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        currentProjectConfigId
          ? [
              {
                id: "run-native-commands",
                profileId: null,
                status: "completed",
                startedAt: "2026-02-02T00:00:00Z",
                finishedAt: "2026-02-02T00:00:01Z",
                events: [],
                inputs: {
                  runType: "external_agent",
                  projectConfigId: currentProjectConfigId,
                  chatId: "native-chat",
                  engineConfigId: externalEngine.id,
                  messages: [],
                },
                outputs: {
                  metadata: {
                    engineConfigId: externalEngine.id,
                    agentNativeSlashCommands: ["/deploy"],
                  },
                },
              },
            ]
          : [],
      ),
    });
  });

  await ensureAppReady(page);
  await seedAIStore(page, {
    agentRunsAuthorityState: "terminal_error",
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: "Failed to load agent runs",
  });
  await page.reload();
  await page.waitForSelector(".setta-gpu-flow__pane");

  const projectContext = await openIsolatedProject(page);
  currentProjectConfigId = projectContext.projectConfigId;

  try {
    const projectChatSurface = await openSlashCommandsViewer(page);

    const llmTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: llmEngine.name })
      .first();
    const externalTab = page
      .getByTestId("skills-mcp-slash-tab")
      .filter({ hasText: externalEngine.name })
      .first();
    await expect(llmTab).toBeVisible();
    await expect(externalTab).toBeVisible();
    await expect(llmTab).toHaveClass(/bg-blue-50/);
    await expect(externalTab).not.toHaveClass(/bg-blue-50/);

    const commandInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-command-input",
    );
    const promptInput = projectChatSurface.getByTestId(
      "project-chat-custom-slash-prompt-input",
    );
    const addButton = projectChatSurface.getByTestId(
      "project-chat-custom-slash-add",
    );

    await commandInput.fill("/project-status");
    await promptInput.fill("Summarize project health.");

    await expect
      .poll(() => getAgentRunsRequests, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => await addButton.isEnabled(), { timeout: 10_000 })
      .toBe(true);
    await expect(llmTab).toHaveClass(/bg-blue-50/);
    await expect(externalTab).not.toHaveClass(/bg-blue-50/);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
