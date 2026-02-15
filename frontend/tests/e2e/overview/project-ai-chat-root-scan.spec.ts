import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("project chat skips workspace root scan when returning to an existing chat", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let getRootCalls = 0;
  let getFolderCalls = 0;
  // Count expensive root-scan endpoints while still serving real backend responses.
  await page.route("**/api/getFileBrowserRoot", async (route) => {
    getRootCalls += 1;
    await route.continue();
  });
  await page.route("**/api/getFolderContents", async (route) => {
    getFolderCalls += 1;
    await route.continue();
  });

  const fakeChatId = "pw-project-chat-existing";
  await page.route("**/api/getLLMResponse", async (route) => {
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
        messages: [
          {
            id: "pw-user-msg",
            role: "user",
            content: [{ type: "text", text: "hello from playwright" }],
            attachments: [],
          },
          {
            id: "pw-assistant-msg",
            role: "assistant",
            content: [{ type: "text", text: "ready" }],
          },
        ],
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
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    const input = overviewPane.getByPlaceholder("Type a message...");
    await input.fill("Start existing chat");
    await input.press("Enter");
    await expect(overviewPane.getByText("hello from playwright")).toBeVisible();

    const baselineRootCalls = getRootCalls;
    const baselineFolderCalls = getFolderCalls;

    // Re-mount Project AI Chat with an active chat to verify scans are skipped.
    await page.getByTestId("overview-tab-overview").click();
    await page.getByTestId("overview-tab-project-ai-chat").click();
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();
    await expect(overviewPane.getByText("hello from playwright")).toBeVisible();

    await page.waitForTimeout(300);
    expect(getRootCalls).toBe(baselineRootCalls);
    expect(getFolderCalls).toBe(baselineFolderCalls);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat clears python starter visibility when a new root scan cannot resolve python signals", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let useSecondWorkspaceRoot = false;
  await page.route("**/api/getFileBrowserRoot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: useSecondWorkspaceRoot
          ? "/tmp/workspace-b"
          : "/tmp/workspace-a",
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    const request = route.request().postDataJSON() as { folderPath?: string };
    if (request.folderPath === "/tmp/workspace-a") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            name: "pyproject.toml",
            path: "/tmp/workspace-a/pyproject.toml",
            type: "file",
            extension: "toml",
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  const fakeChatId = "pw-project-chat-scan";
  await page.route("**/api/getLLMResponse", async (route) => {
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
        messages: [
          {
            id: "pw-chat-msg",
            role: "assistant",
            content: [{ type: "text", text: "chat active" }],
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

    const createProjectButton = overviewPane.getByRole("button", {
      name: /^Create Project$/,
    });
    await expect(createProjectButton).toBeVisible();

    const input = overviewPane.getByPlaceholder("Type a message...");
    await input.fill("start chat");
    await input.press("Enter");
    await expect(overviewPane.getByText("chat active")).toBeVisible();

    useSecondWorkspaceRoot = true;
    await overviewPane.getByRole("button", { name: "New Chat" }).click();
    await expect(createProjectButton).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat backs off root polling after repeated stable root scans", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let getRootCalls = 0;
  await page.route("**/api/getFileBrowserRoot", async (route) => {
    getRootCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: "/tmp/workspace-stable",
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

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    await expect
      .poll(() => getRootCalls, { timeout: 15000 })
      .toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(6200);
    const postBackoffTransitionCalls = getRootCalls;
    await page.waitForTimeout(6200);
    expect(getRootCalls).toBe(postBackoffTransitionCalls);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat recovers root polling after a transient getFileBrowserRoot failure", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  allowExpectedApiError(page, {
    path: "/api/getFileBrowserRoot",
    statuses: [500],
    method: "POST",
    count: 1,
  });

  let getRootCalls = 0;
  await page.route("**/api/getFileBrowserRoot", async (route) => {
    getRootCalls += 1;
    if (getRootCalls === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "temporary failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: "/tmp/workspace-recover",
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "pyproject.toml",
          path: "/tmp/workspace-recover/pyproject.toml",
          type: "file",
          extension: "toml",
        },
      ]),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    await expect
      .poll(() => getRootCalls, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    await expect(
      overviewPane.getByRole("button", { name: /^Create Project$/ }),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
