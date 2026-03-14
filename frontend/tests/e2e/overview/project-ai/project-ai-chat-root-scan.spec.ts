import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

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
  await page.route("**/api/getExternalAgentChat", async (route) => {
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

test("project chat keeps create-project starter visible when a new root scan cannot resolve python signals", async ({
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
  await page.route("**/api/getExternalAgentChat", async (route) => {
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
    await expect(createProjectButton).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat still revalidates root scans when root path stays the same", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let hasPythonMarkers = true;
  let getFolderContentsCalls = 0;
  await page.route("**/api/getFileBrowserRoot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: "/tmp/workspace-cache-revalidate",
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    getFolderContentsCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        hasPythonMarkers
          ? [
              {
                name: "pyproject.toml",
                path: "/tmp/workspace-cache-revalidate/pyproject.toml",
                type: "file",
                extension: "toml",
              },
            ]
          : [],
      ),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const createProjectButton = overviewPane.getByRole("button", {
      name: /^Create Project$/,
    });
    await expect(createProjectButton).toBeVisible();

    hasPythonMarkers = false;
    await expect
      .poll(() => getFolderContentsCalls, { timeout: 20000 })
      .toBeGreaterThanOrEqual(2);
    await expect(createProjectButton).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat avoids overlapping root scans while a folder request is in flight", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let getFolderContentsCalls = 0;
  const pendingResolvers: Array<() => void> = [];

  await page.route("**/api/getFileBrowserRoot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: "/tmp/workspace-overlap-guard",
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    getFolderContentsCalls += 1;
    await new Promise<void>((resolve) => {
      pendingResolvers.push(resolve);
    });
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
    await expect.poll(() => getFolderContentsCalls, { timeout: 5000 }).toBe(1);

    // Keep the first request unresolved past the 5s revalidation interval.
    await page.waitForTimeout(6200);
    expect(getFolderContentsCalls).toBe(1);
  } finally {
    while (pendingResolvers.length > 0) {
      const resolve = pendingResolvers.shift();
      if (resolve) {
        resolve();
      }
    }
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat immediately rescans after in-flight scan when root identity changes", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let rootPath = "/tmp/workspace-race-a";
  let getRootCalls = 0;
  const resolvedRoots: string[] = [];
  const scannedRoots: string[] = [];
  let releaseFirstScan: (() => void) | null = null;
  let shouldBlockFirstScan = true;

  await page.route("**/api/getFileBrowserRoot", async (route) => {
    getRootCalls += 1;
    resolvedRoots.push(rootPath);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath,
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    const request = route.request().postDataJSON() as { folderPath?: string };
    const folder = request.folderPath ?? "";
    scannedRoots.push(folder);
    if (folder === "/tmp/workspace-race-a" && shouldBlockFirstScan) {
      await new Promise<void>((resolve) => {
        releaseFirstScan = () => {
          shouldBlockFirstScan = false;
          releaseFirstScan = null;
          resolve();
        };
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        folder === "/tmp/workspace-race-a"
          ? [
              {
                name: "pyproject.toml",
                path: "/tmp/workspace-race-a/pyproject.toml",
                type: "file",
                extension: "toml",
              },
            ]
          : [],
      ),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();
    await expect.poll(() => scannedRoots.length, { timeout: 5000 }).toBe(1);

    // Change the root while the first scan is still pending.
    rootPath = "/tmp/workspace-race-b";
    await expect
      .poll(() => getRootCalls, { timeout: 12000 })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => resolvedRoots.includes("/tmp/workspace-race-b"), {
        timeout: 12000,
      })
      .toBe(true);

    if (!releaseFirstScan) {
      throw new Error("First root scan did not block as expected.");
    }
    const releaseStartedAt = Date.now();
    releaseFirstScan();
    await expect.poll(() => scannedRoots.length, { timeout: 3000 }).toBe(2);
    expect(scannedRoots[0]).toBe("/tmp/workspace-race-a");
    expect(scannedRoots[1]).toBe("/tmp/workspace-race-b");
    expect(Date.now() - releaseStartedAt).toBeLessThan(3000);
    await expect(
      overviewPane.getByRole("button", { name: /^Create Project$/ }),
    ).toBeVisible();
  } finally {
    if (releaseFirstScan) {
      releaseFirstScan();
    }
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

test("project chat keeps create-project starter visible when switching projects before the next root scan resolves", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  let firstProjectContext: Awaited<
    ReturnType<typeof openIsolatedProject>
  > | null = null;
  let secondProjectContext: Awaited<
    ReturnType<typeof openIsolatedProject>
  > | null = null;

  let activeRootPath = "/tmp/workspace-switch-a";
  let secondScanStarted = false;
  let releaseSecondScan: (() => void) | null = null;

  await page.route("**/api/getFileBrowserRoot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rootPath: activeRootPath,
        pathSeparator: "/",
        ignorePatterns: [],
      }),
    });
  });
  await page.route("**/api/getFolderContents", async (route) => {
    const request = route.request().postDataJSON() as { folderPath?: string };
    if (request.folderPath === "/tmp/workspace-switch-a") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            name: "pyproject.toml",
            path: "/tmp/workspace-switch-a/pyproject.toml",
            type: "file",
            extension: "toml",
          },
        ]),
      });
      return;
    }
    if (request.folderPath === "/tmp/workspace-switch-b") {
      secondScanStarted = true;
      await new Promise<void>((resolve) => {
        releaseSecondScan = () => {
          releaseSecondScan = null;
          resolve();
        };
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  try {
    firstProjectContext = await openIsolatedProject(page);

    const overviewPane = page.locator("#OverviewPane");
    const createProjectButton = overviewPane.getByRole("button", {
      name: /^Create Project$/,
    });
    await expect(createProjectButton).toBeVisible();

    activeRootPath = "/tmp/workspace-switch-b";
    secondProjectContext = await openIsolatedProject(page);
    await expect.poll(() => secondScanStarted, { timeout: 5000 }).toBe(true);
    await expect(createProjectButton).toBeVisible();

    if (!releaseSecondScan) {
      throw new Error("Second root scan did not block as expected.");
    }
    releaseSecondScan();
    await expect(createProjectButton).toBeVisible();
  } finally {
    if (releaseSecondScan) {
      releaseSecondScan();
    }
    await engineCleanup();
    await cleanupIsolatedProject(page, secondProjectContext);
    await cleanupIsolatedProject(page, firstProjectContext);
  }
});
