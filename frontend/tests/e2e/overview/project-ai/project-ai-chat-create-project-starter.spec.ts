import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

async function disableProjectChatAutoCreate(page: Page) {
  await page.route("**/api/loadSettings", async (route) => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      chatWindowing?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...settings,
        chatWindowing: {
          ...(settings.chatWindowing ?? {}),
          autoCreateInitialChat: false,
        },
      }),
    });
  });
  await page.route("**/api/loadProjectConfig", async (route) => {
    const response = await route.fetch();
    const projectState = (await response.json()) as {
      projectChatWindowing?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...projectState,
        projectChatWindowing: {
          order: [],
          instancesById: {},
        },
      }),
    });
  });
}

async function ensureCreateProjectStarterButton(
  overviewPane: Locator,
): Promise<Locator> {
  const starterButton = overviewPane.page().getByRole("button", {
    name: /^Create Project$/,
  }).first();
  if (await starterButton.isVisible().catch(() => false)) {
    return starterButton;
  }
  const newChatButton = overviewPane.getByRole("button", {
    name: /^New Chat$/i,
  });
  if (await newChatButton.isVisible().catch(() => false)) {
    await overviewPane.page().evaluate(async () => {
      const { useProjectState } = await import("/src/state/definitions.ts");
      const {
        ChatWindowPlacementEnum,
        createProjectChatWindowInstance,
        createProjectChatWindowingState,
      } = await import("/src/utils/generatedTypes.ts");
      useProjectState.setState((state) => {
        state.projectChatWindowing = createProjectChatWindowingState({
          order: ["project-chat-window-1"],
          instancesById: {
            "project-chat-window-1": createProjectChatWindowInstance({
              instanceId: "project-chat-window-1",
              placement: ChatWindowPlacementEnum.bottom_docked,
              chatId: null,
              isMinimized: false,
            }),
          },
        });
      });
    });
    await expect(starterButton).toBeVisible();
    return starterButton;
  }
  throw new Error("Expected project chat starter surface to be available.");
}

test("project ai create-project starter submits a codebase-first clarifying prompt when python signals exist", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const restoreManagedEngine = await ensureManagedChatEngine(page);
  let workspaceScans = 0;
  let submittedPrompt = "";
  await disableProjectChatAutoCreate(page);

  await page.route("**/api/getFileBrowserRoot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: "/tmp/project-ai-starter-codebase",
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    workspaceScans += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "pyproject.toml",
          path: "/tmp/project-ai-starter-codebase/pyproject.toml",
          type: "file",
          extension: "toml",
        },
      ]),
    });
  });
  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as {
      message?: { content?: Array<{ type?: string; text?: string }> };
    };
    const textContent = payload.message?.content?.find(
      (content) => content.type === "text",
    );
    submittedPrompt = textContent?.text ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        chatId: "pw-project-ai-starter-codebase-chat",
        runId: "pw-project-ai-starter-codebase-chat-run",
        engineType: "setta_llm",
        sectionId: null,
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

    const starterButton = await ensureCreateProjectStarterButton(overviewPane);
    await expect(starterButton).toBeEnabled();

    // Wait for workspace scan completion so the starter chooses codebase-first wording.
    await expect
      .poll(() => workspaceScans, { timeout: 5000 })
      .toBeGreaterThan(0);
    await starterButton.click();
    await expect
      .poll(() => submittedPrompt, { timeout: 5000 })
      .toContain("Assume this workspace already contains a real codebase");
    expect(submittedPrompt).toContain(
      "ask me 8-12 concise clarifying questions",
    );
  } finally {
    await restoreManagedEngine();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai create-project starter submits a no-codebase clarifying prompt when python signals are absent", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const restoreManagedEngine = await ensureManagedChatEngine(page);
  let submittedPrompt = "";
  await disableProjectChatAutoCreate(page);

  await page.route("**/api/getFileBrowserRoot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: "/tmp/project-ai-starter-no-codebase",
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as {
      message?: { content?: Array<{ type?: string; text?: string }> };
    };
    const textContent = payload.message?.content?.find(
      (content) => content.type === "text",
    );
    submittedPrompt = textContent?.text ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        chatId: "pw-project-ai-starter-no-codebase-chat",
        runId: "pw-project-ai-starter-no-codebase-chat-run",
        engineType: "setta_llm",
        sectionId: null,
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
      }),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const starterButton = await ensureCreateProjectStarterButton(overviewPane);
    await starterButton.click();

    await expect
      .poll(() => submittedPrompt, { timeout: 5000 })
      .toContain("No existing codebase was detected");
    expect(submittedPrompt).toContain(
      "ask me 8-12 concise clarifying questions",
    );
  } finally {
    await restoreManagedEngine();
    await cleanupIsolatedProject(page, projectContext);
  }
});
