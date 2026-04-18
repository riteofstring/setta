import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("header python language server banner stays visible until the selected plugin is applied", async ({
  page,
}) => {
  let applied = false;

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.status.selectedLanguageServers = [
        {
          languageId: "python",
          selectedPluginId: "setta-basedpyright",
          state: "ready",
          applied,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("restart is still required");

    applied = true;

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header python language server banner explains when the selected plugin does not provide Python", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.status.selectedLanguageServers = [
        {
          languageId: "python",
          selectedPluginId: "setta-fixturedsl",
          state: "selected_plugin_wrong_language",
          applied: false,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("does not provide Python");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
