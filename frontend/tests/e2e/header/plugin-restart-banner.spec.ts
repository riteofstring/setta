import { expect, test } from "@playwright/test";
import path from "path";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

test("header plugin restart banner supports restart action and plugins shortcut", async ({
  page,
}) => {
  const backendFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend",
  );

  let pluginListRequestCount = 0;
  let pluginStatusRequestCount = 0;
  let restartRequestCount = 0;

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: backendFixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.route("**/api/plugins/list", async (route) => {
      pluginListRequestCount += 1;
      const response = await route.fetch();
      const payload = await response.json();
      const plugins = Array.isArray(payload.plugins) ? payload.plugins : [];
      payload.restartCapability = {
        mode: "programmatic",
        command: null,
        reason: null,
      };
      payload.plugins = plugins.map((plugin: { pluginId?: string }) => {
        if (plugin.pluginId !== "setta-fixture-backend") {
          return plugin;
        }
        return {
          ...plugin,
          restartRequired: true,
        };
      });
      await route.fulfill({ response, json: payload });
    });

    await page.route("**/api/plugins/status", async (route) => {
      pluginStatusRequestCount += 1;
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await page.route("**/api/plugins/restart", async (route) => {
      restartRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accepted: true,
          mode: "programmatic",
          command: null,
          reason: null,
        }),
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const restartBannerText = page.getByText(
      /^Restart required for \d+ plugins?$/,
    );
    await expect(restartBannerText).toBeVisible();
    const restartBanner = restartBannerText.locator("xpath=ancestor::div[1]");

    const listCountBeforeRestart = pluginListRequestCount;
    const statusCountBeforeRestart = pluginStatusRequestCount;
    await restartBanner
      .getByRole("button", { name: "Restart", exact: true })
      .click();

    await expect.poll(() => restartRequestCount).toBe(1);
    await expect
      .poll(() => pluginListRequestCount)
      .toBeGreaterThan(listCountBeforeRestart);
    await expect
      .poll(() => pluginStatusRequestCount)
      .toBeGreaterThan(statusCountBeforeRestart);
    await expect(page.getByText("Restart request accepted.")).toBeVisible();

    await restartBanner
      .getByRole("button", { name: "Plugins", exact: true })
      .click();
    await expect(
      page.getByText("Plugin Runtime", { exact: true }),
    ).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-backend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header plugin restart banner shows manual command when capability is manual", async ({
  page,
}) => {
  const backendFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend",
  );

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: backendFixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.route("**/api/plugins/list", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const plugins = Array.isArray(payload.plugins) ? payload.plugins : [];
      payload.restartCapability = {
        mode: "manual",
        command: "setta --restart",
        reason: "Programmatic restart disabled in fixture.",
      };
      payload.plugins = plugins.map((plugin: { pluginId?: string }) => {
        if (plugin.pluginId !== "setta-fixture-backend") {
          return plugin;
        }
        return {
          ...plugin,
          restartRequired: true,
        };
      });
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const restartBannerText = page.getByText(
      /^Restart required for \d+ plugins?$/,
    );
    await expect(restartBannerText).toBeVisible();
    const restartBanner = restartBannerText.locator("xpath=ancestor::div[1]");

    await expect(
      restartBanner.getByText("setta --restart", { exact: true }),
    ).toBeVisible();
    await expect(
      restartBanner.getByRole("button", { name: "Restart", exact: true }),
    ).toHaveCount(0);
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-backend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header plugin restart banner handles rejected and failed restart requests", async ({
  page,
}) => {
  const backendFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend",
  );
  let restartRequestCount = 0;

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: backendFixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.route("**/api/plugins/list", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const plugins = Array.isArray(payload.plugins) ? payload.plugins : [];
      payload.restartCapability = {
        mode: "programmatic",
        command: null,
        reason: null,
      };
      payload.plugins = plugins.map((plugin: { pluginId?: string }) => {
        if (plugin.pluginId !== "setta-fixture-backend") {
          return plugin;
        }
        return {
          ...plugin,
          restartRequired: true,
        };
      });
      await route.fulfill({ response, json: payload });
    });

    await page.route("**/api/plugins/status", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await page.route("**/api/plugins/restart", async (route) => {
      restartRequestCount += 1;
      if (restartRequestCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            accepted: false,
            mode: "programmatic",
            command: "setta --restart",
            reason: "Programmatic restart request was rejected.",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "restart failed" }),
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const restartBannerText = page.getByText(
      /^Restart required for \d+ plugins?$/,
    );
    await expect(restartBannerText).toBeVisible();
    const restartBanner = restartBannerText.locator("xpath=ancestor::div[1]");
    const restartButton = restartBanner.getByRole("button", {
      name: "Restart",
      exact: true,
    });

    await restartButton.click();
    await expect.poll(() => restartRequestCount).toBe(1);
    await expect(
      page.getByText("Manual restart required: setta --restart"),
    ).toBeVisible();

    allowExpectedApiError(page, {
      path: "/api/plugins/restart",
      statuses: [500],
      method: "POST",
      count: 1,
    });
    await restartButton.click();
    await expect.poll(() => restartRequestCount).toBe(2);
    await expect(page.getByText("Restart request failed.")).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-backend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
