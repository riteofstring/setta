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

  let pluginRuntimeRequestCount = 0;
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

    await page.route("**/api/plugins/runtime", async (route) => {
      pluginRuntimeRequestCount += 1;
      const response = await route.fetch();
      const payload = await response.json();
      const plugins = Array.isArray(payload.list?.plugins)
        ? payload.list.plugins
        : [];
      payload.list.restartCapability = {
        mode: "programmatic",
        command: null,
        reason: null,
      };
      payload.list.plugins = plugins.map((plugin: { pluginId?: string }) => {
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

    const runtimeCountBeforeRestart = pluginRuntimeRequestCount;
    await restartBanner
      .getByRole("button", { name: "Restart", exact: true })
      .click();

    await expect.poll(() => restartRequestCount).toBe(1);
    await page.waitForTimeout(300);
    expect(pluginRuntimeRequestCount).toBe(runtimeCountBeforeRestart);
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

test("header plugin restart banner remains visible for status-only restart tombstones", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.list.plugins = [];
      payload.status.plugins = [
        {
          pluginId: "setta-fixture-backend",
          name: "Setta Fixture Backend",
          version: "0.1.0",
          state: "pending_restart",
          sourceScope: "workspace",
          sourceScopeLabel: "workspace",
          sourcePath: "[redacted]:workspace:setta-fixture-backend",
          canonicalSourceKey: "redacted:workspace:setta-fixture-backend",
          sourceDigestSha256: null,
          shadowedBySourcePath: null,
          requestedCapabilities: [],
          effectiveCapabilities: [],
          blockedCapabilities: [],
          registeredLanguageServers: [],
          registeredExternalAgentAdapters: [],
          registeredCodegenTargets: [],
          enablementSource: "workspace_enabled",
          restartRequired: true,
          errors: [],
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(page.getByText("Restart required for 1 plugin")).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("header plugin restart banner is hidden in non-IDE runtime modes", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.list.serverMode = "share";
      payload.status.serverMode = "share";
      payload.list.plugins = [
        {
          pluginId: "setta-fixture-backend",
          name: "Setta Fixture Backend",
          version: "0.1.0",
          sourceScope: "workspace",
          sourceScopeLabel: "workspace",
          sourceManager: "setta",
          sourceManagerHint: null,
          canonicalSourceKey: "local:/tmp/setta-fixture-backend",
          sourceDigestSha256: "digest",
          frontend: {
            entrypointUrl: null,
            styleUrl: null,
          },
          content: {
            hasBlueprints: false,
            hasProjectTemplates: false,
            hasPrompts: false,
          },
          config: {
            hasSchema: false,
            schemaJson: null,
            currentConfig: {},
          },
          effectiveCapabilities: [],
          enablementSource: "workspace_enabled",
          restartRequired: true,
        },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByText(/^Restart required for \d+ plugins?$/),
    ).toHaveCount(0);
  } finally {
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

    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const plugins = Array.isArray(payload.list?.plugins)
        ? payload.list.plugins
        : [];
      payload.list.restartCapability = {
        mode: "manual",
        command: "setta --restart",
        reason: "Programmatic restart disabled in fixture.",
      };
      payload.list.plugins = plugins.map((plugin: { pluginId?: string }) => {
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

    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const plugins = Array.isArray(payload.list?.plugins)
        ? payload.list.plugins
        : [];
      payload.list.restartCapability = {
        mode: "programmatic",
        command: null,
        reason: null,
      };
      payload.list.plugins = plugins.map((plugin: { pluginId?: string }) => {
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
