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
  setProjectChatSurfaceWidth,
} from "./chat-composer-control-helpers";

type EngineConfigSummary = {
  id: string;
  engineType: string;
};

test.describe.serial("chat composer context controls", () => {
  test("managed chat section shows estimated context badge from hydrated usage and toggles display mode", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config",
            model: "gpt-5-codex",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
          contextUsage: {
            contextWindowTokens: 200,
            contextUsedTokens: 150,
            estimated: true,
          },
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge__",
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
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const input = section.locator("textarea").first();
      await expect(input).toBeVisible();

      await input.fill("Context badge test");
      await input.press("Enter");

      const percentageBadge = section.getByRole("button", {
        name: /^est\. context(?: left)? 25%$/i,
      });
      await expect(percentageBadge).toBeVisible();
      await percentageBadge.click();
      await expect(
        section.getByRole("button", {
          name: /^est\. context(?: left)? ~50$/i,
        }),
      ).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows non-estimated context percentages for large windows", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat-large-window"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config-large-window",
            model: "gpt-5-codex",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
          contextUsage: {
            contextWindowTokens: 258400,
            contextUsedTokens: 24766,
            estimated: false,
          },
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge_large_window__",
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
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const input = section.locator("textarea").first();
      await expect(input).toBeVisible();

      await input.fill("Context badge large-window test");
      await input.press("Enter");

      await expect(
        section.getByRole("button", {
          name: /^context(?: left)? 90%$/i,
        }),
      ).toBeVisible();
      await expect(
        section.getByRole("button", {
          name: /^est\. context(?: left)?/i,
        }),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows context unavailable badge when usage payload is missing", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat-missing-usage"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config",
            model: "gpt-5-codex",
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

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge_missing_usage__",
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
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(section.locator("textarea").first()).toBeVisible();
      await expect(section.getByLabel(/context unavailable/i)).toBeVisible();
      await expect(
        section.getByRole("button", {
          name: /^est\. context(?: left)?/i,
        }),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows context unavailable badge when usage payload is partial", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat-partial-usage"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config",
            model: "gpt-5-codex",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
          contextUsage: {
            contextWindowTokens: 200,
            contextUsedTokens: null,
            estimated: false,
          },
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge_partial_usage__",
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
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(section.locator("textarea").first()).toBeVisible();
      await expect(section.getByLabel(/context unavailable/i)).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat collapses the threads label below the toolbar label breakpoint while keeping settings accessible", async ({
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
      const returnToChatButton = projectChatSurface
        .getByRole("button", { name: /^Return to chat$/ })
        .first();
      if (await returnToChatButton.isVisible()) {
        await returnToChatButton.click();
      }

      const historyVisibleLabel = projectChatSurface
        .getByRole("button", { name: "View Threads" })
        .locator("span", { hasText: /^Threads$/ })
        .first();
      const settingsButton = projectChatSurface.getByRole("button", {
        name: "Project AI Settings",
      });

      await setProjectChatSurfaceWidth(page, 960);
      await expect(historyVisibleLabel).toBeVisible();
      await expect(settingsButton).toBeVisible();

      await setProjectChatSurfaceWidth(page, 700);
      await expect(historyVisibleLabel).toBeHidden();
      await expect(settingsButton).toBeVisible();
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
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const input = section.locator("textarea").first();

      // `/search` is intentionally unavailable in managed section slash menus.
      await input.fill("/search off");
      await input.press("Enter");

      await expect(
        section.getByText(
          "/search is unavailable in the current context. Use /help.",
        ),
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
      await page.waitForSelector(".setta-gpu-flow__pane");

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await input.fill("/tmp build logs look stale");
      await input.press("Enter");

      await expect.poll(() => llmSubmitCount).toBe(1);
      await expect(
        projectChatSurface.getByText(
          "Unknown or unavailable command. Use /help.",
        ),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
