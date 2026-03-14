import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

test("project ai threads restore deleted thread and group via explicit restore action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const engineConfigsResponse = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(engineConfigsResponse.ok()).toBe(true);
  const engineConfigs = (await engineConfigsResponse.json()) as Array<{
    id: string;
    engineType: string;
  }>;
  const firstConfig = engineConfigs[0];
  if (!firstConfig) {
    throw new Error(
      "Expected at least one engine config for restore flow test.",
    );
  }

  await page.route("**/api/getAgentRuns", async (route) => {
    const runs = engineConfigs.map((config, index) => {
      const runType =
        config.engineType === "external_agent" ? "external_agent" : "llm_chat";
      const day = String(10 + index).padStart(2, "0");
      return {
        id: `run-restore-${config.id}`,
        profileId: null,
        status: "completed",
        startedAt: `2026-01-${day}T00:00:00Z`,
        finishedAt: `2026-01-${day}T00:00:01Z`,
        events: [],
        inputs: {
          runType,
          projectConfigId: projectContext.projectConfigId,
          chatId: `pw-restore-thread-${config.id}`,
          engineConfigId: config.id,
          messages: [
            {
              id: `msg-restore-${config.id}`,
              role: "user",
              content: [{ type: "text", text: "Thread restore target" }],
              attachments: [],
            },
          ],
        },
        outputs: {
          name: `Restore target thread ${index + 1}`,
          nameSource: "llm",
        },
        toolCalls: [],
        cost: null,
      };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(runs),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-restore",
            role: "assistant",
            content: [{ type: "text", text: "Restore test reply" }],
          },
        ],
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
        messages: [
          {
            id: "assistant-restore",
            role: "assistant",
            content: [{ type: "text", text: "Restore test reply" }],
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

    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();
    const restoreButton = overviewPane
      .getByTestId("project-chat-thread-restore-last-delete-button")
      .first();
    await expect(restoreButton).toBeVisible();
    await expect(restoreButton).toBeDisabled();
    await expect(restoreButton).toHaveAttribute("aria-label", "Undo Delete");

    await expect(
      threadsPanel.getByTestId("project-chat-thread-entry").first(),
    ).toBeVisible();
    const threadEntries = threadsPanel.getByTestId("project-chat-thread-entry");
    const initialThreadCount = await threadEntries.count();
    expect(initialThreadCount).toBeGreaterThan(0);

    await overviewPane.getByRole("button", { name: "New Group" }).click();
    const groupNameInput = threadsPanel.getByTestId(
      "project-chat-thread-group-name-input",
    );
    await expect(groupNameInput).toBeVisible();
    await groupNameInput.fill("Restore Group");
    await groupNameInput.press("Enter");
    const restoreGroupRow = threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Restore Group" });
    await expect(restoreGroupRow).toBeVisible();

    const restoreThreadEntry = threadEntries.first();
    await restoreThreadEntry.hover();
    const deleteThreadButton = restoreThreadEntry.getByTestId(
      "project-chat-thread-delete-button",
    );
    await deleteThreadButton.hover();
    await expect(page.getByText("Press Cmd/Ctrl+Z to undo.")).toHaveCount(0);
    await deleteThreadButton.click();
    await expect(threadEntries).toHaveCount(initialThreadCount - 1);
    await expect(restoreButton).toBeEnabled();

    await restoreButton.click();
    await expect(threadEntries).toHaveCount(initialThreadCount);
    await expect(restoreButton).toBeDisabled();

    await restoreGroupRow
      .getByTestId("project-chat-thread-group-select")
      .hover();
    const deleteGroupButton = restoreGroupRow.getByTestId(
      "project-chat-thread-group-delete-button",
    );
    await deleteGroupButton.hover();
    await expect(page.getByText("Press Cmd/Ctrl+Z to undo.")).toHaveCount(0);
    await deleteGroupButton.click();
    await expect(
      threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .filter({ hasText: "Restore Group" }),
    ).toHaveCount(0);
    await expect(restoreButton).toBeEnabled();

    await restoreButton.click();
    await expect(
      threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .filter({ hasText: "Restore Group" }),
    ).toHaveCount(1);
    await expect(restoreButton).toBeDisabled();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
