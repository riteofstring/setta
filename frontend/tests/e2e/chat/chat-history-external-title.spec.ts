import { expect, test } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../helpers";

test("project chat history shows external title source badge", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "ProjectAIChat", overviewVis: true });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT ?? "";
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT.");
  }

  const runId = "pw-run-external-title";
  const agentRunsDir = path.join(workspaceRoot, "setta_files", "agent_runs");
  const runPath = path.join(agentRunsDir, `${runId}.json`);
  await fs.mkdir(agentRunsDir, { recursive: true });

  const now = new Date().toISOString();
  const chatId = "pw-chat-external-title";
  const title = "External Chat Title";
  const runPayload = {
    id: runId,
    profileId: null,
    status: "completed",
    startedAt: now,
    finishedAt: now,
    inputs: {
      runType: "external_agent",
      chatId,
      projectConfigId: projectContext.projectConfigId,
      messages: [
        {
          id: "pw-msg-1",
          role: "user",
          content: [{ type: "text", text: "Seeded external run" }],
          attachments: [],
        },
      ],
    },
    outputs: {
      name: title,
      nameSource: "external",
    },
    toolCalls: [],
    cost: null,
    events: [],
  };

  await fs.writeFile(runPath, JSON.stringify(runPayload, null, 2), "utf8");

  try {
    const overviewPane = page.locator("#OverviewPane");
    await page.getByRole("button", { name: "View History" }).click();

    await expect(
      overviewPane.getByRole("heading", { name: title }),
    ).toBeVisible();
    await expect(overviewPane.getByTitle("Title source: External")).toBeVisible();
  } finally {
    await fs.rm(runPath, { force: true });
    await cleanupIsolatedProject(page, projectContext);
  }
});
