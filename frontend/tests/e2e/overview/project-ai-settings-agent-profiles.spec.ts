import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("agent profile toggles are visible and default off", async ({ page }) => {
  await setOverviewTab(page, "ProjectAISettings");
  const projectContext = await openIsolatedProject(page);
  try {
    const agentProfilesSection = page
      .getByRole("heading", { name: "Agent Profiles" })
      .locator("xpath=ancestor::section[1]");
    await expect(agentProfilesSection).toBeVisible();

    await agentProfilesSection.getByRole("button", { name: "New Profile" }).click();

    const backgroundFillToggle = agentProfilesSection.getByRole("checkbox", {
      name: "Enable Background Summary Fill",
    });
    await backgroundFillToggle.scrollIntoViewIfNeeded();
    await expect(backgroundFillToggle).toBeVisible();
    await expect(backgroundFillToggle).not.toBeChecked();

    const llmTitlesToggle = agentProfilesSection.getByRole("checkbox", {
      name: "Enable LLM Chat Titles",
    });
    await llmTitlesToggle.scrollIntoViewIfNeeded();
    await expect(llmTitlesToggle).toBeVisible();
    await expect(llmTitlesToggle).not.toBeChecked();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
