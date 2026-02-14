import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("plugin external agent adapters are visible in plugins pane and selectable in AI settings", async ({
  page,
}) => {
  const pluginId = "setta-fixture-backend-external-agent";
  const pluginHeading = `${pluginId}@0.1.0`;
  const adapterId = `${pluginId}:fixture-agent`;

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: pluginHeading,
          exact: true,
        }),
      })
      .first();

    await expect(pluginCard).toBeVisible();
    await expect(
      pluginCard.getByText("Registered External Agent Adapters", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pluginCard.getByText("Fixture External Agent", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pluginCard.getByText(
        adapterId,
        {
          exact: true,
        },
      ),
    ).toBeVisible();

    await setOverviewTab(page, "ProjectAISettings");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const externalAgentsSection = page
      .getByRole("heading", { name: "External Agents" })
      .locator("xpath=ancestor::section[1]");
    await expect(externalAgentsSection).toBeVisible();

    await externalAgentsSection
      .getByRole("button", { name: "New External Agent", exact: true })
      .click();
    await externalAgentsSection.locator("input").first().fill(
      "Fixture Plugin Agent",
    );

    const toolTypeSelect = externalAgentsSection.locator("select").first();
    const pluginAdapterSelect = externalAgentsSection
      .locator("select")
      .filter({ has: page.locator(`option[value='${adapterId}']`) })
      .first();
    await expect(async () => {
      await toolTypeSelect.selectOption("plugin");
      await expect(toolTypeSelect).toHaveValue("plugin");
      await expect(pluginAdapterSelect).toBeVisible();
    }).toPass();
    await pluginAdapterSelect.selectOption(adapterId);

    const runModeSelect = externalAgentsSection.locator("select").nth(1);
    await expect(runModeSelect).toHaveValue("sdk");
    await expect(
      externalAgentsSection
        .getByRole("button", { name: "Save", exact: true })
        .first(),
    ).toBeEnabled();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
