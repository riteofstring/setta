import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("project overview ignores running activity from other project configs", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  let getAgentRunsRequestCount = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-other-project",
          profileId: null,
          status: "running",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: null,
          events: [],
          inputs: {
            runType: "llm_chat",
            chatId: "chat-other-project",
            sectionId: "section-other-project",
            projectConfigId: "project-other",
          },
          outputs: null,
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.waitForSelector(".react-flow__pane");
    await expect
      .poll(() => getAgentRunsRequestCount, { timeout: 10000 })
      .toBeGreaterThan(0);

    const baselineRequestCount = getAgentRunsRequestCount;
    await page.waitForTimeout(6200);
    expect(getAgentRunsRequestCount).toBe(baselineRequestCount);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project overview retries getAgentRuns after an initial load failure", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  allowExpectedApiError(page, {
    path: "/api/getAgentRuns",
    statuses: [500],
    method: "GET",
    count: 1,
  });
  let getAgentRunsRequestCount = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsRequestCount += 1;
    if (getAgentRunsRequestCount === 1) {
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
      body: JSON.stringify([]),
    });
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.waitForSelector(".react-flow__pane");
    await expect
      .poll(() => getAgentRunsRequestCount, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    const requestCountAfterRecovery = getAgentRunsRequestCount;
    await page.waitForTimeout(6200);
    expect(getAgentRunsRequestCount).toBe(requestCountAfterRecovery);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
