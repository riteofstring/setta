import { expect, test } from "@playwright/test";

import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

test("project ai create-project starter submits a codebase-first clarifying prompt when python signals exist", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const restoreManagedEngine = await ensureManagedChatEngine(page);
  let workspaceScans = 0;
  let submittedPrompt = "";

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
      body: JSON.stringify("pw-project-ai-starter-codebase-chat"),
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

    const starterButton = overviewPane.getByRole("button", {
      name: "Create Project",
    });
    await expect(starterButton).toBeVisible();
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
      body: JSON.stringify("pw-project-ai-starter-no-codebase-chat"),
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
    const starterButton = overviewPane.getByRole("button", {
      name: "Create Project",
    });
    await expect(starterButton).toBeVisible();
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
