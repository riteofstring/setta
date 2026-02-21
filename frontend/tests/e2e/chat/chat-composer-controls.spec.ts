import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setChatSectionState,
  setOverviewTab,
} from "../helpers";

type EngineConfigSummary = {
  id: string;
  engineType: string;
};

test.describe.serial("chat composer controls", () => {
  test("chat sections keep a compact composer with permission-only footer controls", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    let llmSubmitCount = 0;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.continue();
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_composer__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-existing",
              role: "user",
              content: [{ type: "text", text: "Existing thread message" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: null,
          branches: {},
        },
      });

      await expect(section.getByText("Existing thread message")).toBeVisible();
      await expect(section.getByRole("button", { name: "/new" })).toHaveCount(
        0,
      );
      await expect(
        section.getByRole("button", { name: "/resume" }),
      ).toHaveCount(0);
      await expect(
        section.getByRole("button", { name: "Summarize Codebase" }),
      ).toHaveCount(0);
      await expect(
        section.getByRole("button", { name: "Create Project" }),
      ).toHaveCount(0);

      const input = section.locator("textarea").first();
      await input.fill("/resume");
      const sectionSuggestions = page
        .locator("div.fixed.z-40.overflow-y-auto")
        .filter({ hasText: "/resume" })
        .first();
      await expect(sectionSuggestions).toBeVisible();
      await expect(sectionSuggestions).toHaveClass(/overflow-x-hidden/);
      const resumeSuggestion = sectionSuggestions
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
      await input.press("Enter");
      await expect
        .poll(async () => {
          const text = await section.textContent();
          return Boolean(
            text?.includes("No previous branch found to resume.") ||
              text?.includes("Resumed the latest branch."),
          );
        })
        .toBe(true);
      await input.fill("/search off");
      await input.press("Enter");
      expect(llmSubmitCount).toBe(0);

      await section
        .getByRole("button", { name: /^minimal/i })
        .first()
        .click();
      await page.getByRole("menuitem", { name: "yolo" }).click();
      await expect(
        section.getByRole("button", { name: /^yolo/i }),
      ).toBeVisible();
      await expect(section.getByRole("button", { name: "Search" })).toHaveCount(
        0,
      );
      await expect(section.getByRole("button", { name: "Skills" })).toHaveCount(
        0,
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat shows starter controls with visible slash menu and full execution footer", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let llmSubmitCount = 0;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.continue();
    });

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await expect(
        overviewPane.getByRole("button", { name: "/new" }),
      ).toHaveCount(0);
      await expect(
        overviewPane.getByRole("button", { name: "/resume" }),
      ).toHaveCount(0);
      await expect(
        overviewPane.getByRole("button", { name: "/model" }),
      ).toHaveCount(0);
      await expect(
        overviewPane.getByRole("button", { name: /^Create Project UI$/ }),
      ).toHaveCount(0);
      const createProjectButton = overviewPane.getByRole("button", {
        name: /^Create Project$/,
      });
      await expect(createProjectButton).toBeVisible();
      const summarizeCodebaseButton = overviewPane.getByRole("button", {
        name: /^Summarize Codebase$/,
      });
      await expect(summarizeCodebaseButton).toBeVisible();
      const planNextStepsButton = overviewPane.getByRole("button", {
        name: /^Plan Next Steps$/,
      });
      await expect(planNextStepsButton).toBeVisible();
      const quickActionButtons: Locator[] = [
        createProjectButton,
        summarizeCodebaseButton,
        planNextStepsButton,
      ];
      await expectButtonsStackedVertically(quickActionButtons);

      const firstButtonClass =
        await quickActionButtons[0]?.getAttribute("class");
      const secondButtonClass =
        await quickActionButtons[1]?.getAttribute("class");
      expect(firstButtonClass).toBeTruthy();
      expect(firstButtonClass).toBe(secondButtonClass);

      const input = overviewPane.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("/res");
      const projectSuggestions = page
        .locator("div.fixed.z-40.overflow-y-auto")
        .filter({ hasText: "/resume" })
        .first();
      await expect(projectSuggestions).toBeVisible();
      await expect(projectSuggestions).toHaveClass(/overflow-x-hidden/);
      const resumeSuggestion = projectSuggestions
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
      const inputBox = await input.boundingBox();
      const suggestionBox = await resumeSuggestion.boundingBox();
      if (!inputBox || !suggestionBox) {
        throw new Error("Missing slash suggestion geometry.");
      }
      expect(suggestionBox.y + suggestionBox.height).toBeLessThan(
        inputBox.y + 2,
      );

      const submitButton = overviewPane
        .locator('button[type="submit"]')
        .first();
      await input.fill("/res");
      await submitButton.click();
      await expect
        .poll(async () => {
          const text = await overviewPane.textContent();
          return Boolean(
            text?.includes("No previous project chat found to resume.") ||
              text?.includes("Resumed the latest project chat."),
          );
        })
        .toBe(true);
      expect(llmSubmitCount).toBe(0);

      await input.fill("/Resume");
      await submitButton.click();
      await expect
        .poll(async () => {
          const text = await overviewPane.textContent();
          return Boolean(
            text?.includes("No previous project chat found to resume.") ||
              text?.includes("Resumed the latest project chat."),
          );
        })
        .toBe(true);
      expect(llmSubmitCount).toBe(0);

      await expect(
        overviewPane.getByRole("button", { name: /^minimal/i }),
      ).toBeVisible();
      const searchButton = overviewPane.getByRole("button", { name: "Search" });
      await expect(searchButton).toBeVisible();
      await searchButton.click();
      await expect(searchButton).toHaveAttribute("aria-pressed", "false");
      await input.fill("/search on");
      await input.press("Enter");
      await expect(searchButton).toHaveAttribute("aria-pressed", "true");
      await input.fill("/search off");
      await input.press("Enter");
      await expect(searchButton).toHaveAttribute("aria-pressed", "false");
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat sections reject unavailable slash commands locally instead of forwarding to model", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let llmSubmitCount = 0;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-managed-unavailable-slash"),
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
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_managed_chat_unavailable_slash__",
      );
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngineId,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const input = section.locator("textarea").first();
      const submitButton = section.locator('button[type="submit"]').first();

      // `/search` is intentionally unavailable in managed section slash menus.
      await input.fill("/search off");
      await submitButton.click();

      await expect(
        section.getByText("Unknown or unavailable command. Use /help."),
      ).toBeVisible();
      expect(llmSubmitCount).toBe(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat allows prompts that begin with absolute paths", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let llmSubmitCount = 0;
    const fakeChatId = "pw-path-chat";

    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeChatId),
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
            id: "e2e-llm",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        }),
      });
    });

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      const input = overviewPane.getByPlaceholder("Type a message...");
      await input.fill("/tmp build logs look stale");
      await input.press("Enter");

      await expect.poll(() => llmSubmitCount).toBe(1);
      await expect(
        overviewPane.getByText("Unknown or unavailable command. Use /help."),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat resume ignores incompatible engine history entries", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

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

    const matchingChatId = "chat-resume-match";
    const mismatchedChatId = "chat-resume-mismatch";
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
        ]),
      });
    });
    await page.route("**/api/getLLMChat", async (route) => {
      const request = route.request().postDataJSON() as
        | { chatId?: string }
        | undefined;
      const requestedChatId = request?.chatId;
      const replyText =
        requestedChatId === matchingChatId
          ? "Resumed matching chat"
          : "Resumed mismatched chat";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: "msg-resume",
              role: "assistant",
              content: [{ type: "text", text: replyText }],
            },
          ],
          waitingForResponse: false,
          llmConfig: null,
        }),
      });
    });

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await overviewPane.getByRole("button", { name: "View History" }).click();
      await expect(
        overviewPane.getByText("matching history entry"),
      ).toBeVisible();
      await expect(
        overviewPane.getByText("mismatch history entry"),
      ).toHaveCount(0);

      await overviewPane.getByRole("button", { name: "View History" }).click();
      const input = overviewPane.getByPlaceholder("Type a message...");
      await input.fill("/resume");
      await input.press("Enter");

      await expect(
        overviewPane.getByText("Resumed matching chat"),
      ).toBeVisible();
      await expect(
        overviewPane.getByText("Resumed mismatched chat"),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section history refreshes runs when the history panel opens", async ({
    page,
  }) => {
    let historySectionId: string | null = null;
    let historyRefreshArmed = false;
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      const runs =
        historyRefreshArmed && historySectionId
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
                  chatId: "chat-history-refresh",
                  sectionId: historySectionId,
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

    try {
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
        engineConfigId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
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
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
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
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      const runs =
        idleSectionId === null
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
                  chatId: "chat-history-idle",
                  sectionId: idleSectionId,
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

    try {
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
        engineConfigId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await section.getByRole("button", { name: "History" }).click();
      await expect(section.getByText("Idle history entry")).toBeVisible();
      const requestCountAfterOpen = getAgentRunsRequestCount;

      await page.waitForTimeout(6200);
      expect(getAgentRunsRequestCount).toBe(requestCountAfterOpen);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}

async function expectButtonsStackedVertically(
  buttons: Locator[],
): Promise<void> {
  if (buttons.length < 2) {
    throw new Error("Need at least two buttons to verify vertical stacking.");
  }
  const boxes = await Promise.all(
    buttons.map(async (button) => {
      const box = await button.boundingBox();
      if (!box) {
        throw new Error("Missing quick-action button geometry.");
      }
      return box;
    }),
  );
  let previousBottom = boxes[0].y + boxes[0].height;
  const firstCenterX = boxes[0].x + boxes[0].width / 2;
  for (let index = 1; index < boxes.length; index += 1) {
    const box = boxes[index];
    const centerX = box.x + box.width / 2;
    expect(centerX).toBeGreaterThan(firstCenterX - 2);
    expect(centerX).toBeLessThan(firstCenterX + 2);
    expect(box.y).toBeGreaterThan(previousBottom - 1);
    previousBottom = box.y + box.height;
  }
}
