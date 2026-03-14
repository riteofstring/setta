import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

test("plugin language servers are visible in plugins pane runtime status", async ({
  page,
}) => {
  const pluginHeading = "setta-fixture-backend-language-server-e2e@0.1.0";

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
      pluginCard.getByText("Registered Language Servers", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pluginCard.getByText("fixturedsl", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pluginCard.getByRole("textbox", {
        name: "settings.fixtureDslLanguageServer",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
