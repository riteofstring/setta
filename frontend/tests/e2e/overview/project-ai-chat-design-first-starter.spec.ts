import { expect, test } from "@playwright/test";

import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("project ai design-first starter button prefills the first prompt draft", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    const starterButton = overviewPane.getByRole("button", {
      name: "Create Project UI (Design First)",
    });
    await expect(starterButton).toBeVisible();

    // Clicking the starter control should inject the design-first scaffold
    // directly into the chat composer for immediate refinement.
    await starterButton.click();
    const input = overviewPane.getByPlaceholder("Type a message...");
    await expect(input).toHaveValue(
      /I want to run a design-first workflow before implementation\./,
    );
    await expect(input).toHaveValue(/Ask me 8-12 concise questions/);
    await expect(input).toHaveValue(/style tile, style anchor image/);
    await expect(input).toHaveValue(/MCP\/Figma flow/);

    // Re-clicking should not overwrite an in-progress custom draft.
    await input.fill("custom draft");
    await starterButton.click();
    await expect(input).toHaveValue("custom draft");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
