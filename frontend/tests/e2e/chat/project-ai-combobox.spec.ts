import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  allowExpectedApiError,
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

  await overviewPane
    .getByRole("button", { name: "Project AI Settings" })
    .click();

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

  await overviewPane
    .getByRole("button", { name: "Project AI Settings" })
    .click();
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

  const projectChatSurface = await getVisibleProjectChatSurface(page);
  await setProjectChatSurfaceWidth(projectChatSurface, 920);
  await openProjectChatThreads(page);
  const threadsPanel = page.getByTestId("project-chat-threads-panel").first();
  await expect(threadsPanel).toBeVisible();

  await projectChatSurface
    .getByRole("button", { name: "Project AI Settings" })
    .evaluate((element: HTMLButtonElement) => element.click());
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
      body: JSON.stringify({
        chatId: "chat-new-beta",
        runId: "chat-new-beta-run",
        engineType: "setta_llm",
        sectionId: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas-flow__canvas");

    const overviewPane = page.locator("#OverviewPane");
    const projectChatSurface = overviewPane
      .getByTestId("overview-tab-content-shell")
      .first();
    await setProjectChatSurfaceWidth(projectChatSurface, 920);
    await openProjectChatThreads(page);
    const threadsPanel = overviewPane
      .getByTestId("project-chat-threads-panel")
      .first();
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Legacy Setta Thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.evaluate((element: HTMLElement) => element.click());
    await expect(
      projectChatSurface.getByText("Hydrated legacy alpha chat.").first(),
    ).toBeVisible();

    await projectChatSurface
      .getByRole("button", { name: "Project AI Settings" })
      .evaluate((element: HTMLButtonElement) => element.click());
    const engineInput = page.getByPlaceholder("Select an engine");
    await expect(engineInput).toBeVisible();
    await engineInput.fill("Setta LLM Beta");
    await engineInput.press("Enter");
    await expect(engineInput).toHaveValue("Setta LLM Beta");

    await expect(
      projectChatSurface.getByTestId("project-chat-engine-switch-banner"),
    ).toContainText("Continue in a new thread");
    await expect(projectChatSurface.locator("textarea").first()).toBeDisabled();

    await projectChatSurface
      .getByTestId("project-chat-engine-switch-continue-button")
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(
      projectChatSurface.getByTestId("project-chat-engine-switch-banner"),
    ).toHaveCount(0);
    await expect(projectChatSurface.locator("textarea").first()).toBeEnabled();
    await expect(
      projectChatSurface.getByText("Hydrated legacy alpha chat.").first(),
    ).toBeVisible();

    await projectChatSurface
      .locator("textarea")
      .first()
      .fill("Continue on beta.");
    await projectChatSurface.locator("textarea").first().press("Enter");
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

test("project chat continuation preserves source chat id across failed first submit retry", async ({
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

  const submittedPayloads: Array<{
    chatId: string | null;
    continueFromChatId: string | null;
    engineConfigId: string;
  }> = [];
  let submitAttempt = 0;

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
    submittedPayloads.push({
      chatId: payload?.chatId ?? null,
      continueFromChatId: payload?.continueFromChatId ?? null,
      engineConfigId: payload?.engineConfigId ?? "",
    });
    submitAttempt += 1;
    if (submitAttempt === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "forced first-submit failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        chatId: "chat-new-beta",
        runId: "chat-new-beta-run",
        engineType: "setta_llm",
        sectionId: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas-flow__canvas");

    const overviewPane = page.locator("#OverviewPane");
    const projectChatSurface = overviewPane
      .getByTestId("overview-tab-content-shell")
      .first();
    await setProjectChatSurfaceWidth(projectChatSurface, 920);
    await openProjectChatThreads(page);
    const threadsPanel = overviewPane
      .getByTestId("project-chat-threads-panel")
      .first();
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Legacy Setta Thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.evaluate((element: HTMLElement) => element.click());
    await expect(
      projectChatSurface.getByText("Hydrated legacy alpha chat.").first(),
    ).toBeVisible();

    await projectChatSurface
      .getByRole("button", { name: "Project AI Settings" })
      .evaluate((element: HTMLButtonElement) => element.click());
    const engineInput = page.getByPlaceholder("Select an engine");
    await expect(engineInput).toBeVisible();
    await engineInput.fill("Setta LLM Beta");
    await engineInput.press("Enter");
    await expect(engineInput).toHaveValue("Setta LLM Beta");

    await projectChatSurface
      .getByTestId("project-chat-engine-switch-continue-button")
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(
      projectChatSurface.getByTestId("project-chat-engine-switch-banner"),
    ).toHaveCount(0);

    allowExpectedApiError(page, {
      path: "/api/getLLMResponse",
      statuses: [500],
      method: "POST",
      count: 1,
    });
    await projectChatSurface
      .locator("textarea")
      .first()
      .fill("Attempt one should fail.");
    await projectChatSurface.locator("textarea").first().press("Enter");
    await expect.poll(() => submittedPayloads.length).toBe(1);

    await projectChatSurface
      .locator("textarea")
      .first()
      .fill("Attempt two should work.");
    await projectChatSurface.locator("textarea").first().press("Enter");
    await expect.poll(() => submittedPayloads.length).toBe(2);

    expect(submittedPayloads).toEqual([
      {
        chatId: null,
        continueFromChatId: "chat-legacy-alpha",
        engineConfigId: "engine-beta",
      },
      {
        chatId: null,
        continueFromChatId: "chat-legacy-alpha",
        engineConfigId: "engine-beta",
      },
    ]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function getVisibleProjectChatSurface(page: Page): Promise<Locator> {
  const surfaceCandidates = [
    page.getByTestId("project-chat-maximized-window").first(),
    page.getByTestId("project-chat-floating-window").first(),
    page.getByTestId("project-chat-bottom-dock-window-panel").first(),
    page
      .locator('#OverviewPane [data-chat-surface-mode="project_ai_mode"]')
      .first(),
  ];
  await expect
    .poll(async () => {
      for (const candidate of surfaceCandidates) {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  for (const candidate of surfaceCandidates) {
    if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
      return candidate;
    }
  }
  throw new Error("No visible project chat surface found.");
}

async function setProjectChatSurfaceWidth(
  projectChatSurface: Locator,
  widthPx: number,
): Promise<void> {
  const didSet = await projectChatSurface.evaluate((surface, width) => {
    const panel =
      surface.closest(
        '[data-testid="project-chat-bottom-dock-window-panel"], [data-testid="project-chat-floating-window"], [data-testid="project-chat-maximized-window"]',
      ) ?? surface;
    if (!(panel instanceof HTMLElement)) {
      return false;
    }
    const widthValue = `${width}px`;
    panel.style.width = widthValue;
    panel.style.minWidth = widthValue;
    panel.style.maxWidth = widthValue;
    panel.style.flexBasis = widthValue;
    return true;
  }, widthPx);
  expect(didSet).toBe(true);
  await expect
    .poll(async () => {
      return projectChatSurface.evaluate((surface) =>
        Math.round(surface.getBoundingClientRect().width),
      );
    })
    .toBeGreaterThanOrEqual(widthPx - 4);
}

async function openProjectChatThreads(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useAIStore } = await import("/src/state/definitions.ts");
    useAIStore.setState({ viewThreads: true });
  });
}
