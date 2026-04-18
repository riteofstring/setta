import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

test("restart language server shortcut shows backend guidance for unconfigured language servers", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    allowExpectedApiError(page, {
      path: "/api/restartLanguageServer",
      statuses: [409],
      method: "POST",
    });

    await page.route("**/api/restartLanguageServer", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "language_server_not_configured",
            detail:
              "Language server is not configured. Select a plugin and restart after it is available.",
          },
        }),
      });
    });

    await page.keyboard.press("Alt+Shift+R");

    await expect(
      page.locator(".header-notification-fade", {
        hasText:
          "Language server is not configured. Select a plugin and restart after it is available.",
      }),
    ).toHaveCount(1);
    await expect(
      page.locator(".header-notification-fade", {
        hasText: "Restarting Language Server",
      }),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header python language server banner clears after a successful restart refresh", async ({
  page,
}) => {
  let runtimeLoads = 0;

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.route("**/api/plugins/runtime", async (route) => {
      runtimeLoads += 1;
      const response = await route.fetch();
      const payload = await response.json();
      payload.status.selectedLanguageServers = [
        {
          languageId: "python",
          selectedPluginId: "setta-basedpyright",
          state: "ready",
          selectedPluginApplied: runtimeLoads > 1,
          liveServerAvailable: runtimeLoads > 1,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.route("**/api/restartLanguageServer", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("restart is still required");

    await page.keyboard.press("Alt+Shift+R");

    await expect(
      page.locator(".header-notification-fade", {
        hasText: "Restarting Language Server",
      }),
    ).toHaveCount(1);
    await expect.poll(() => runtimeLoads).toBeGreaterThan(1);
    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

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
          selectedPluginApplied: applied,
          liveServerAvailable: applied,
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

test("header python language server banner stays visible after rescan until restart applies the plugin", async ({
  page,
}) => {
  let pluginAvailable = false;
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
          state: pluginAvailable ? "ready" : "selected_plugin_missing",
          selectedPluginApplied: applied,
          liveServerAvailable: applied,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.route("**/api/plugins/rescan", async (route) => {
      pluginAvailable = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          serverMode: "ide",
          installedPlugins: 1,
          activePlugins: 1,
        }),
      });
    });

    await page.route("**/api/restartLanguageServer", async (route) => {
      applied = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("is not installed or active");

    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("restart is still required");

    await page.keyboard.press("Alt+Shift+R");

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
          selectedPluginApplied: false,
          liveServerAvailable: false,
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

test("header python language server banner explains when a wrong-language selection leaves the current Python server live until restart", async ({
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
          selectedPluginApplied: false,
          liveServerAvailable: true,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("will remain available until restart");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header python language server banner explains when an unavailable plugin is still applied until restart", async ({
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
          selectedPluginId: "setta-basedpyright",
          state: "selected_plugin_unavailable",
          selectedPluginApplied: true,
          liveServerAvailable: true,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("will remain available until restart");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header python language server banner explains when the selected plugin is unavailable", async ({
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
          selectedPluginId: "setta-basedpyright",
          state: "selected_plugin_unavailable",
          selectedPluginApplied: false,
          liveServerAvailable: false,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByTestId("python-language-server-status-banner"),
    ).toContainText("is unavailable");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
