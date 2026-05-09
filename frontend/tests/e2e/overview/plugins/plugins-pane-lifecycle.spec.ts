import { expect, test } from "@playwright/test";
import path from "path";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  openOverviewMoreDestination,
  postBackend,
  setOverviewTab,
} from "../../helpers";
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

test("plugins pane supports live programmatic restart action", async ({
  page,
}) => {
  const backendFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend",
  );
  let runtimeRequestCount = 0;
  let restartRequestCount = 0;
  await setOverviewTab(page, "Plugins");
  await page.route("**/api/plugins/runtime", async (route) => {
    runtimeRequestCount += 1;
    await route.continue();
  });
  await page.route("**/api/plugins/restart", async (route) => {
    restartRequestCount += 1;
    await route.continue();
  });
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: backendFixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const runtimeSection = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Plugin Runtime",
          exact: true,
        }),
      })
      .first();
    await expect(runtimeSection).toContainText("mode=ide status=loaded");
    await expect(runtimeSection).toContainText(
      "restart capability: programmatic",
    );

    const restartButton = page.getByRole("button", {
      name: "Restart Setta",
      exact: true,
    });
    await expect(restartButton).toBeEnabled();
    const runtimeCountBeforeRestart = runtimeRequestCount;
    await restartButton.click();

    await expect.poll(() => restartRequestCount).toBe(1);
    await expect
      .poll(() => runtimeRequestCount)
      .toBe(runtimeCountBeforeRestart + 1);
    await expect(
      page.getByText("Restart request accepted.").first(),
    ).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-backend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugins pane shows restart rejection and request-failure messaging", async ({
  page,
}) => {
  let restartRequestCount = 0;
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/runtime", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        list: {
          schemaVersion: 1,
          serverMode: "ide",
          restartCapability: {
            mode: "programmatic",
            command: null,
            reason: null,
          },
          plugins: [],
        },
        status: {
          schemaVersion: 1,
          serverMode: "ide",
          plugins: [],
        },
      }),
    });
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
          command: "setta restart",
          reason: "Programmatic restart request was rejected.",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "restart endpoint failed",
      }),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");

  const restartButton = page.getByRole("button", {
    name: "Restart Setta",
    exact: true,
  });
  await restartButton.click();
  await expect.poll(() => restartRequestCount).toBe(1);
  await expect(
    page
      .getByText(
        "Manual restart required: setta restart. Programmatic restart request was rejected.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();

  allowExpectedApiError(page, {
    path: "/api/plugins/restart",
    statuses: [500],
    method: "POST",
    count: 1,
  });
  await restartButton.click();
  await expect.poll(() => restartRequestCount).toBe(2);
  await expect(
    page.getByText("Restart request failed: restart endpoint failed").first(),
  ).toBeVisible();
});

test("plugins pane lifecycle action failures surface structured endpoint errors", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/runtime", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        list: {
          schemaVersion: 1,
          serverMode: "ide",
          restartCapability: {
            mode: "manual",
            command: "setta",
            reason: "Programmatic restart is not available in this runtime.",
          },
          plugins: [
            {
              pluginId: "setta-lifecycle-plugin",
              name: "Setta Lifecycle Plugin",
              version: "0.1.0",
              sourceScope: "workspace",
              sourceScopeLabel: "workspace",
              sourceManager: "setta",
              sourceManagerHint: null,
              canonicalSourceKey: "pypi:setta-lifecycle-plugin",
              sourceDigestSha256: "digest-v1",
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
              restartRequired: false,
            },
          ],
        },
        status: {
          schemaVersion: 1,
          serverMode: "ide",
          plugins: [
            {
              pluginId: "setta-lifecycle-plugin",
              name: "Setta Lifecycle Plugin",
              version: "0.1.0",
              state: "active",
              sourceScope: "workspace",
              sourceScopeLabel: "workspace",
              sourceManager: "setta",
              sourceManagerHint: null,
              sourcePath: "/tmp/setta-lifecycle-plugin",
              canonicalSourceKey: "pypi:setta-lifecycle-plugin",
              sourceDigestSha256: "digest-v1",
              shadowedBySourcePath: null,
              requestedCapabilities: [],
              effectiveCapabilities: [],
              blockedCapabilities: [],
              registeredLanguageServers: [],
              registeredExternalAgentAdapters: [],
              registeredCodegenTargets: [],
              restartRequired: false,
              errors: [],
            },
          ],
        },
      }),
    });
  });

  await page.route("**/api/plugins/update", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "PLUGIN_UPDATE_UNAVAILABLE",
          message: "No update target available.",
        },
      }),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");

  const pluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-lifecycle-plugin@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(pluginCard).toBeVisible();

  allowExpectedApiError(page, {
    path: "/api/plugins/update",
    statuses: [400],
    method: "POST",
    count: 1,
  });
  await pluginCard.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    page
      .getByText(
        /Update plugin failed: (?:PLUGIN_UPDATE_UNAVAILABLE - )?No update target available\./,
      )
      .first(),
  ).toBeVisible();
});

test("opening plugins tab does not trigger redundant plugin runtime refresh", async ({
  page,
}) => {
  let pluginRuntimeRequestCount = 0;

  await page.route("**/api/plugins/runtime", async (route) => {
    pluginRuntimeRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        list: {
          schemaVersion: 1,
          serverMode: "ide",
          restartCapability: {
            mode: "manual",
            command: "setta",
            reason: "Programmatic restart is not available in this runtime.",
          },
          plugins: [],
        },
        status: {
          schemaVersion: 1,
          serverMode: "ide",
          plugins: [],
        },
      }),
    });
  });

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  try {
    await page.waitForSelector(".setta-gpu-flow__pane");
    await expect.poll(() => pluginRuntimeRequestCount).toBeGreaterThan(0);

    const runtimeCountBeforePluginsTab = pluginRuntimeRequestCount;

    await openOverviewMoreDestination(page, "Plugins");
    await expect(
      page.getByText("Plugin Runtime", { exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(250);

    expect(pluginRuntimeRequestCount).toBe(runtimeCountBeforePluginsTab);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugins pane remains interactive with a large plugin catalog", async ({
  page,
}) => {
  const pluginCount = 300;
  const listPlugins = Array.from({ length: pluginCount }, (_unused, index) => ({
    pluginId: `setta-large-plugin-${String(index).padStart(3, "0")}`,
    name: `Setta Large Plugin ${index}`,
    version: "0.1.0",
    sourceScope: "workspace",
    sourceScopeLabel: "workspace",
    sourceManager: "setta",
    sourceManagerHint: null,
    canonicalSourceKey: `pypi:setta-large-plugin-${index}`,
    sourceDigestSha256: `digest-${index}`,
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
    restartRequired: false,
  }));
  const statusPlugins = Array.from(
    { length: pluginCount },
    (_unused, index) => ({
      pluginId: `setta-large-plugin-${String(index).padStart(3, "0")}`,
      name: `Setta Large Plugin ${index}`,
      version: "0.1.0",
      state: "active",
      sourceScope: "workspace",
      sourceScopeLabel: "workspace",
      sourceManager: "setta",
      sourceManagerHint: null,
      sourcePath: `/tmp/setta-large-plugin-${index}`,
      canonicalSourceKey: `pypi:setta-large-plugin-${index}`,
      sourceDigestSha256: `digest-${index}`,
      shadowedBySourcePath: null,
      requestedCapabilities: [],
      effectiveCapabilities: [],
      blockedCapabilities: [],
      registeredLanguageServers: [],
      registeredExternalAgentAdapters: [],
      registeredCodegenTargets: [],
      restartRequired: false,
      errors: [],
    }),
  );

  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/runtime", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        list: {
          schemaVersion: 1,
          serverMode: "ide",
          restartCapability: {
            mode: "manual",
            command: "setta",
            reason: "Programmatic restart is not available in this runtime.",
          },
          plugins: listPlugins,
        },
        status: {
          schemaVersion: 1,
          serverMode: "ide",
          plugins: statusPlugins,
        },
      }),
    });
  });

  let rescanRequestCount = 0;
  await page.route("**/api/plugins/rescan", async (route) => {
    rescanRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installedPlugins: pluginCount,
        activePlugins: pluginCount,
      }),
    });
  });

  const startMs = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");
  await expect(
    page.getByRole("heading", {
      name: `Active Plugins (${pluginCount})`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: `Discovery Status (${pluginCount})`,
      exact: true,
    }),
  ).toBeVisible();
  const statusRows = page.locator(
    "tbody tr[class*='border-t border-setta-200']",
  );
  await expect(statusRows).toHaveCount(pluginCount);

  const initialRenderMs = Date.now() - startMs;
  expect(initialRenderMs).toBeLessThan(10000);

  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect.poll(() => rescanRequestCount).toBe(1);
  await expect(
    page.getByText("Rescan plugins completed.", { exact: true }),
  ).toBeVisible();
});
