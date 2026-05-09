import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";
import {
  findSectionByName,
  getVisibleProjectChatSurface,
} from "./chat-composer-control-helpers";

test.describe.serial("chat composer navigation controls", () => {
  test("project chat ArrowUp cycles submitted prompts from prior conversations", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-history-newer",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-02T00:00:00Z",
            finishedAt: "2026-02-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "history-chat-newer",
              sectionId: null,
              messages: [
                {
                  id: "history-user-1",
                  role: "user",
                  content: [{ type: "text", text: "History prompt older" }],
                  attachments: [],
                },
                {
                  id: "history-user-2",
                  role: "user",
                  content: [{ type: "text", text: "History prompt newest" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
          {
            id: "run-history-older",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-01T00:00:00Z",
            finishedAt: "2026-02-01T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "history-chat-older",
              sectionId: null,
              messages: [
                {
                  id: "history-user-3",
                  role: "user",
                  content: [{ type: "text", text: "History prompt oldest" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
        ]),
      });
    });

    try {
      await setOverviewTab(page, "ProjectAIChat");
      await page.reload();
      await page.waitForSelector(".setta-gpu-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toHaveValue("");

      await input.fill("   ");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("Escape");
      await expect(input).toHaveValue("   ");

      await input.fill("");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt older");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt oldest");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("History prompt older");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("Escape");
      await expect(input).toHaveValue("");
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project and section chat use a constrained content shell", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      await page.reload();
      await page.waitForSelector(".setta-gpu-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      const projectShell = projectChatSurface
        .locator('[data-chat-width-shell="true"]')
        .first();
      await expect(projectShell).toBeVisible();
      await expect(projectShell).toHaveClass(/max-w-\[72rem\]/);

      const { sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_width_shell__",
      );
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const sectionShell = section
        .locator('[data-chat-width-shell="true"]')
        .first();
      await expect(sectionShell).toBeVisible();
      await expect(sectionShell).toHaveClass(/max-w-\[72rem\]/);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat thread list includes mixed-engine history entries", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let createdExternalAgentConfigId: string | null = null;
    let createdExternalEngineConfigId: string | null = null;

    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    expect(engineConfigsResponse.ok()).toBe(true);
    const engineConfigs =
      (await engineConfigsResponse.json()) as EngineConfigSummary[];
    const activeEngineId =
      engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
      null;
    if (!activeEngineId) {
      throw new Error("Missing managed LLM engine config for history test.");
    }
    const createdExternalAgentConfig = await postBackend<{ id: string }>(
      page,
      "/createExternalAgentConfig",
      {
        name: "Codex History E2E",
        toolType: "codex",
        runMode: "app_server",
        envVarWhitelist: [],
        workingDirStrategy: "project_root",
      },
    );
    createdExternalAgentConfigId = createdExternalAgentConfig?.id ?? null;
    if (!createdExternalAgentConfigId) {
      throw new Error(
        "Missing external agent config id for mixed-engine history test.",
      );
    }
    const createdExternalEngine = await postBackend<EngineConfigSummary>(
      page,
      "/createEngineConfig",
      {
        name: "Codex History E2E",
        engineType: "external_agent",
        externalAgentConfigId: createdExternalAgentConfigId,
        defaults: {},
      },
    );
    createdExternalEngineConfigId = createdExternalEngine?.id ?? null;
    if (!createdExternalEngineConfigId) {
      throw new Error(
        "Missing external engine config id for mixed-engine history test.",
      );
    }
    await page.evaluate(async () => {
      const { loadEngineConfigs, loadExternalAgentConfigs } = await import(
        "/src/state/actions/ai.ts"
      );
      await loadExternalAgentConfigs(true);
      await loadEngineConfigs(true);
    });
    const expectedExternalBadgeText = "codex";

    const matchingChatId = "chat-resume-match";
    const mismatchedChatId = "chat-resume-mismatch";
    const externalChatId = "chat-resume-external";
    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-match",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-01T00:00:00Z",
            finishedAt: "2026-01-01T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: matchingChatId,
              engineConfigId: activeEngineId,
              messages: [
                {
                  id: "msg-match",
                  role: "user",
                  content: [{ type: "text", text: "matching history entry" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
          {
            id: "run-mismatch",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-02T00:00:00Z",
            finishedAt: "2026-01-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: mismatchedChatId,
              engineConfigId: "engine-incompatible",
              messages: [
                {
                  id: "msg-mismatch",
                  role: "user",
                  content: [{ type: "text", text: "mismatch history entry" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
          {
            id: "run-external",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-03T00:00:00Z",
            finishedAt: "2026-01-03T00:00:01Z",
            events: [],
            inputs: {
              runType: "external_agent",
              projectConfigId: projectContext.projectConfigId,
              chatId: externalChatId,
              engineConfigId: createdExternalEngineConfigId,
              messages: [
                {
                  id: "msg-external",
                  role: "user",
                  content: [{ type: "text", text: "external history entry" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
        ]),
      });
    });
    try {
      await page.reload();
      await page.waitForSelector(".setta-gpu-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      const closeThreadsIfOpen = async () => {
        const returnToChatButton = projectChatSurface
          .getByRole("button", { name: /^Return to chat$/ })
          .first();
        if (await returnToChatButton.isVisible()) {
          await returnToChatButton.click();
          return;
        }
        const existingThreadsPanel = projectChatSurface.getByTestId(
          "project-chat-threads-panel",
        );
        if (
          (await existingThreadsPanel.count()) > 0 &&
          (await existingThreadsPanel.first().isVisible())
        ) {
          await projectChatSurface
            .getByRole("button", { name: "View Threads" })
            .click();
        }
      };
      await closeThreadsIfOpen();

      await projectChatSurface
        .getByRole("button", { name: "View Threads" })
        .click();
      await expect(
        projectChatSurface.getByText("matching history entry"),
      ).toBeVisible();
      await expect(
        projectChatSurface.getByText("mismatch history entry"),
      ).toBeVisible();
      await expect(
        projectChatSurface.getByText("external history entry"),
      ).toBeVisible();
      const matchingThreadEntry = projectChatSurface
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "matching history entry" })
        .first();
      await expect(
        matchingThreadEntry.getByTestId("project-chat-thread-agent-badge"),
      ).toHaveText(/setta/i);
      const externalThreadEntry = projectChatSurface
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "external history entry" })
        .first();
      await expect(
        externalThreadEntry.getByTestId("project-chat-thread-agent-badge"),
      ).toHaveText(new RegExp(expectedExternalBadgeText, "i"));
    } finally {
      if (createdExternalEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdExternalEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (createdExternalAgentConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteExternalAgentConfig`, {
            data: { configId: createdExternalAgentConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
