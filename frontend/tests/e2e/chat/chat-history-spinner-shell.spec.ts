import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type EngineConfigSummary = {
  id: string;
  engineType: string;
};

type HistorySpinnerMetrics = {
  usesSingleCell: boolean;
  hasSpinner: boolean;
  rowWidth: number;
  rowHeight: number;
  spinnerWidth: number;
  spinnerHeight: number;
  spinnerWithinRow: boolean;
};

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}

async function getManagedEngineConfigId(page: Page): Promise<string> {
  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const response = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(response.ok()).toBe(true);
  const engineConfigs = (await response.json()) as EngineConfigSummary[];
  const managedEngineConfigId =
    engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
    null;
  if (!managedEngineConfigId) {
    throw new Error(
      "Missing managed LLM engine config for chat history shell.",
    );
  }
  return managedEngineConfigId;
}

async function readHistorySpinnerMetrics(
  historyRow: Locator,
): Promise<HistorySpinnerMetrics> {
  return historyRow.evaluate((element) => {
    const row = element instanceof HTMLElement ? element : null;
    const rowRect = row?.getBoundingClientRect();
    const spinner = row?.querySelector('[data-unicode-spinner="braille"]');
    const spinnerRect =
      spinner instanceof HTMLElement ? spinner.getBoundingClientRect() : null;
    return {
      usesSingleCell:
        row?.outerHTML.includes("single-cell-container") === true ||
        row?.outerHTML.includes("single-cell-child") === true,
      hasSpinner: spinner instanceof HTMLElement,
      rowWidth: rowRect?.width ?? 0,
      rowHeight: rowRect?.height ?? 0,
      spinnerWidth: spinnerRect?.width ?? 0,
      spinnerHeight: spinnerRect?.height ?? 0,
      spinnerWithinRow:
        !!rowRect &&
        !!spinnerRect &&
        spinnerRect.left >= rowRect.left &&
        spinnerRect.top >= rowRect.top &&
        spinnerRect.right <= rowRect.right &&
        spinnerRect.bottom <= rowRect.bottom,
    };
  });
}

test("managed chat history keeps the constrained shell while the live spinner stays off single-cell helpers", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    const managedEngineConfigId = await getManagedEngineConfigId(page);
    const { sectionId, sectionName } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_chat_history_spinner_shell__",
    );

    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-chat-history-spinner-shell",
            profileId: null,
            status: "running",
            startedAt: "2026-03-18T12:00:00Z",
            finishedAt: null,
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "chat-history-spinner-shell",
              sectionId,
              engineConfigId: managedEngineConfigId,
              messages: [
                {
                  id: "msg-chat-history-spinner-shell",
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Waiting history spinner shell thread",
                    },
                  ],
                  attachments: [],
                },
              ],
            },
            outputs: {
              name: "Waiting history spinner shell thread",
              nameSource: "llm",
            },
            toolCalls: [],
            cost: null,
          },
        ]),
      });
    });

    await postBackend(page, "/setChatSectionSettings", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      managed: true,
      engineConfigId: managedEngineConfigId,
      transcriptionProfileId: null,
      agentProfileId: null,
      thinking: false,
      permissionMode: "minimal",
      searchEnabled: true,
      dictationMode: "auto",
    });

    const section = findSectionByName(page, sectionName);
    await expect(section).toBeVisible();
    await section.getByRole("button", { name: "History" }).click();
    await expect(section.getByRole("button", { name: "Back" })).toBeVisible();

    const historyRow = section
      .locator("button")
      .filter({ hasText: "Waiting history spinner shell thread" })
      .first();
    await expect(historyRow).toBeVisible();
    await expect(
      historyRow.locator('[data-unicode-spinner="braille"]'),
    ).toBeVisible();

    const historyShell = historyRow.locator(
      "xpath=ancestor::*[@data-chat-width-shell='true'][1]",
    );
    await expect(historyShell).toHaveCount(1);
    await expect(historyShell).toHaveClass(/max-w-\[72rem\]/);

    // The managed history branch should keep the same constrained shell while
    // the row-level spinner stays inside a plain flex button, not the shared
    // single-cell helper contract.
    const spinnerMetrics = await readHistorySpinnerMetrics(historyRow);

    expect(spinnerMetrics.usesSingleCell).toBe(false);
    expect(spinnerMetrics.hasSpinner).toBe(true);
    expect(spinnerMetrics.rowWidth).toBeGreaterThan(0);
    expect(spinnerMetrics.rowHeight).toBeGreaterThan(0);
    expect(spinnerMetrics.spinnerWidth).toBeGreaterThan(0);
    expect(spinnerMetrics.spinnerHeight).toBeGreaterThan(0);
    expect(spinnerMetrics.spinnerWithinRow).toBe(true);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
