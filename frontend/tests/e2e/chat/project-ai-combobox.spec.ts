import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../helpers";

test("project ai combobox chevron sizing", async ({ page }) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();

  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();

  const searchWrapper = engineInput.locator("..");
  const toggleButton = searchWrapper.locator("button").first();
  await expect(toggleButton).toBeVisible();

  const inputBox = await engineInput.boundingBox();
  const buttonBox = await toggleButton.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  if (!inputBox || !buttonBox) {
    return;
  }

  expect(buttonBox.height).toBeGreaterThanOrEqual(inputBox.height * 0.9);
  expect(buttonBox.height).toBeLessThanOrEqual(inputBox.height + 1);
  const inputCenter = inputBox.y + inputBox.height / 2;
  const buttonCenter = buttonBox.y + buttonBox.height / 2;
  expect(Math.abs(buttonCenter - inputCenter)).toBeLessThanOrEqual(2);

  const micInput = page.getByPlaceholder("Microphone source");
  await expect(micInput).toBeVisible();
  await expect(
    page.locator('select[aria-label="Microphone source"]'),
  ).toHaveCount(0);
});

test("project chat does not render inline external engine status text", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  // External engine health should be surfaced via notifications, not inline chat labels.
  await expect(overviewPane.getByText("External engine available")).toHaveCount(
    0,
  );
  await expect(
    overviewPane.getByText("Checking external engine status..."),
  ).toHaveCount(0);
  await expect(
    overviewPane.getByText(/External engine unavailable/i),
  ).toHaveCount(0);
});

test("project chat keeps selected Setta LLM engine and shows missing-key warning", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-setta-claude-sonnet",
          name: "Setta LLM (Claude Sonnet 4.5)",
          engineType: "setta_llm",
          settaLlmConfigId: null,
          externalAgentConfigId: null,
          defaults: { thinking: true },
        },
        {
          id: "engine-codex",
          name: "Codex (app-server)",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: "external-codex",
          defaults: { thinking: null },
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
          "claude-sonnet": {
            id: "claude-sonnet",
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "claude-sonnet",
        codexMcpImportedAt: null,
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiKeys: {},
        revision: 0,
      }),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: "external-codex",
          name: "Codex (app-server)",
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

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();
  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();

  // Selecting Setta LLM must remain sticky even when its model lacks a key.
  await engineInput.fill("Setta LLM");
  await engineInput.press("Enter");
  await expect(engineInput).toHaveValue("Setta LLM (Claude Sonnet 4.5)");
  await expect(
    page.getByText(
      "Selected model is unavailable. Missing API key: ANTHROPIC_API_KEY.",
    ),
  ).toBeVisible();
  const llmInput = page
    .locator(
      'input[placeholder="Select an LLM"], input[placeholder="Add an LLM config or API key"]',
    )
    .first();
  await expect(llmInput).toHaveClass(/border-red-500/);
  await page.waitForTimeout(300);
  await expect(engineInput).toHaveValue("Setta LLM (Claude Sonnet 4.5)");
});

test("project chat keeps threads open when switching engines", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-setta",
          name: "Setta LLM (Claude Sonnet 4.5)",
          engineType: "setta_llm",
          settaLlmConfigId: null,
          externalAgentConfigId: null,
          defaults: { thinking: true },
        },
        {
          id: "engine-codex",
          name: "Codex (app-server)",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: null,
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
  if (
    (await threadsPanel.count()) === 0 ||
    !(await threadsPanel.first().isVisible())
  ) {
    await overviewPane.getByRole("button", { name: "View Threads" }).click();
  }
  await expect(threadsPanel.first()).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();
  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();
  await engineInput.fill("Codex");
  await engineInput.press("Enter");
  await expect(engineInput).toHaveValue("Codex (app-server)");

  await expect(threadsPanel.first()).toBeVisible();
});

test("project chat shows continue-in-new-thread banner after engine switch on selected thread", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  let submittedPayload: {
    chatId: string | null;
    continueFromChatId: string | null;
    engineConfigId: string;
  } | null = null;

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-alpha",
          name: "Setta LLM Alpha",
          engineType: "setta_llm",
          settaLlmConfigId: "alpha-model",
          externalAgentConfigId: null,
        },
        {
          id: "engine-beta",
          name: "Setta LLM Beta",
          engineType: "setta_llm",
          settaLlmConfigId: "beta-model",
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
          "alpha-model": {
            id: "alpha-model",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
          "beta-model": {
            id: "beta-model",
            model: "gpt-4.1-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        },
        default_config_id: "alpha-model",
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
          id: "run-legacy-alpha",
          profileId: null,
          status: "completed",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: "2026-02-01T00:00:02Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "chat-legacy-alpha",
            engineConfigId: "engine-alpha",
            messages: [
              {
                id: "legacy-user",
                role: "user",
                content: [{ type: "text", text: "Legacy conversation prompt" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Legacy Setta Thread",
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
    const chatId = payload?.chatId ?? null;
    if (chatId === "chat-legacy-alpha") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: "legacy-assistant",
              role: "assistant",
              content: [{ type: "text", text: "Hydrated legacy alpha chat." }],
            },
          ],
          waitingForResponse: false,
          llmConfig: {
            id: "alpha-model",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
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
        llmConfig: {
          id: "beta-model",
          model: "gpt-4.1-mini",
          provider: "openai",
          api_key_env: null,
          base_url: null,
          other_params: null,
          mcpServerIds: null,
          temporary: false,
        },
        contextUsage: null,
      }),
    });
  });
  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as
      | {
          chatId?: string | null;
          continueFromChatId?: string | null;
          engineConfigId?: string;
        }
      | undefined;
    submittedPayload = {
      chatId: payload?.chatId ?? null,
      continueFromChatId: payload?.continueFromChatId ?? null,
      engineConfigId: payload?.engineConfigId ?? "",
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify("chat-new-beta"),
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
      .filter({ hasText: "Legacy Setta Thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();
    await expect(
      overviewPane.getByText("Hydrated legacy alpha chat.").first(),
    ).toBeVisible();

    await overviewPane.getByRole("button", { name: "Project AI Settings" }).click();
    const engineInput = page.getByPlaceholder("Select an engine");
    await expect(engineInput).toBeVisible();
    await engineInput.fill("Setta LLM Beta");
    await engineInput.press("Enter");
    await expect(engineInput).toHaveValue("Setta LLM Beta");

    await expect(
      overviewPane.getByTestId("project-chat-engine-switch-banner"),
    ).toContainText("Continue in a new thread");
    await expect(overviewPane.locator("textarea").first()).toBeDisabled();

    await overviewPane
      .getByTestId("project-chat-engine-switch-continue-button")
      .click();
    await expect(
      overviewPane.getByTestId("project-chat-engine-switch-banner"),
    ).toHaveCount(0);
    await expect(overviewPane.locator("textarea").first()).toBeEnabled();
    await expect(
      overviewPane.getByText("Hydrated legacy alpha chat.").first(),
    ).toBeVisible();

    await overviewPane.locator("textarea").first().fill("Continue on beta.");
    await overviewPane.locator("textarea").first().press("Enter");
    await expect.poll(() => submittedPayload).not.toBeNull();
    expect(submittedPayload).toEqual({
      chatId: null,
      continueFromChatId: "chat-legacy-alpha",
      engineConfigId: "engine-beta",
    });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
