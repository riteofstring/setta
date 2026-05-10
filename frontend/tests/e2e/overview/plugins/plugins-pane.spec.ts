import { expect, test } from "@playwright/test";
import path from "path";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  openOverviewMoreDestination,
  postBackend,
  setOverviewTab,
} from "../../helpers";
test("plugins overview tab supports fixture plugin render and disabled fallback", async ({
  page,
}) => {
  const backendFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend",
  );
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  await expect(page.getByText("Plugin Runtime")).toBeVisible();
  const runtimeSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Plugin Runtime",
        exact: true,
      }),
    })
    .first();
  await expect(runtimeSection).not.toContainText("generation=");
  await expect(page.getByText("Install Plugin")).toBeVisible();
  await expect(
    page.getByPlaceholder("github:owner/repo[#ref] or pypi:package[==version]"),
  ).toBeVisible();
  await expect(page.getByTestId("plugin-install-scope")).toHaveValue(
    "workspace",
  );
  await expect(
    page
      .getByTestId("plugin-install-scope")
      .locator("option[value='workspace']"),
  ).toHaveText("workspace");
  await expect(
    page
      .getByTestId("plugin-install-scope")
      .locator("option[value='setta_files']"),
  ).toHaveText("setta_files");
  await expect(
    page.getByTestId("plugin-install-scope").locator("option[value='global']"),
  ).toHaveText("global");
  await expect(
    page
      .getByTestId("plugin-install-scope")
      .locator("option[value='environment']"),
  ).toHaveCount(0);
  await page
    .getByPlaceholder("github:owner/repo[#ref] or pypi:package[==version]")
    .fill("file:/tmp/plugin");
  await page.getByRole("button", { name: "Install", exact: true }).click();
  await expect(
    page.getByText("Unsupported source spec. Use github: or pypi:."),
  ).toBeVisible();

  await postBackend(page, "/plugins/link", {
    localPluginRoot: backendFixturePluginRoot,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");
  const backendPluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-backend@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(backendPluginCard).toBeVisible();
  await expect(
    backendPluginCard.getByText(/scope=workspace source=local:/),
  ).toBeVisible();

  await postBackend(page, "/plugins/link", {
    localPluginRoot: fixturePluginRoot,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");
  const frontendPluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-frontend@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(frontendPluginCard).toBeVisible();
  await expect(
    frontendPluginCard.getByText(/scope=workspace source=local:/),
  ).toBeVisible();
  await expect(
    frontendPluginCard.getByRole("button", {
      name: "Open Fixture Pane",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(
      "#overview-plugin-pane-tab-setta-fixture-frontend-fixture-overview-pane .setta-plugin-pane-icon--dashboard",
    ),
  ).toBeVisible();
  await frontendPluginCard
    .getByRole("button", { name: "Open Fixture Pane", exact: true })
    .click();
  await expect(
    page.getByText("Fixture pane mounted.", { exact: true }),
  ).toBeVisible();
  await page.getByTestId("overview-tab-overview").click();
  await expect(
    page.getByText("Fixture pane mounted.", { exact: true }),
  ).not.toBeVisible();
  await page
    .locator(
      "#overview-plugin-pane-tab-setta-fixture-frontend-fixture-overview-pane",
    )
    .click();
  await expect(
    page.getByText("Fixture pane mounted.", { exact: true }),
  ).toBeVisible();

  const paneCommandRunsMetric = page.getByTestId("fixture-pane-command-runs");
  const paneLastCommandMetric = page.getByTestId("fixture-pane-last-command");
  await expect(paneCommandRunsMetric).toHaveText("0");
  await page.getByTestId("fixture-pane-run-command").click();
  await expect(paneCommandRunsMetric).toHaveText("1");
  await expect(paneLastCommandMetric).toContainText("fixture-backend:active");
  await expect(paneLastCommandMetric).toContainText("health:not-registered");

  await page.getByTestId("fixture-pane-note-input").fill("plugin ux note");
  await page.getByTestId("fixture-pane-save-note").click();
  await expect(page.getByTestId("fixture-pane-note-preview")).toContainText(
    "plugin ux note",
  );
  await page.getByTestId("fixture-pane-clear-note").click();
  await expect(page.getByTestId("fixture-pane-note-preview")).toContainText(
    "No scratchpad note saved yet.",
  );

  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+Shift+P" : "Control+Shift+P");
  const searchInput = page.locator("#ProjectPageSearchBar");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("Fixture Command");
  await expect(
    page.getByText("Fixture Command (setta-fixture-frontend)"),
  ).toBeVisible();
  await page.getByText("Fixture Command (setta-fixture-frontend)").click();
  const commandRunCount = await page.evaluate(() => {
    return Number(
      (window as { __settaFixtureCommandRuns?: number })
        .__settaFixtureCommandRuns || 0,
    );
  });
  expect(commandRunCount).toBeGreaterThan(1);

  await openOverviewMoreDestination(page, "Plugins");
  const fixtureCommandButton = page.getByRole("button", {
    name: "Fixture Command",
    exact: true,
  });
  await expect(fixtureCommandButton).toBeVisible();
  await fixtureCommandButton.click();

  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error(
      "Unable to resolve viewport bounds for plugin section placement.",
    );
  }

  const created = await createTopLevelSectionFromFrontend(page, {
    projectConfigId: projectContext.projectConfigId,
    implType: "Plugin",
    controlCodeObjType: null,
    implOverrides: {
      type: "Plugin",
      pluginId: "setta-fixture-frontend",
      kind: "fixture-card",
      data: {
        text: "hello plugin",
      },
    },
    position: {
      x: viewportBounds.x + viewportBounds.w * 0.45,
      y: viewportBounds.y + viewportBounds.h * 0.25,
    },
    topLevelSections: null,
    viewportBounds,
  });
  expect(created?.sectionId).toBeTruthy();

  await expect(page.getByText("Fixture Plugin Card")).toBeVisible();
  await expect(page.getByText("fixture:hello plugin")).toBeVisible();
  const fixtureSectionCard = page.getByTestId("fixture-plugin-card").first();
  const signalScore = fixtureSectionCard.getByTestId(
    "fixture-card-signal-value",
  );
  const themeLabel = fixtureSectionCard.getByTestId("fixture-card-theme-label");
  await expect(signalScore).toHaveText("0");
  await expect(themeLabel).toContainText("theme:sunrise");
  await fixtureSectionCard.getByTestId("fixture-card-boost").click();
  await expect(signalScore).toHaveText("1");
  await fixtureSectionCard.getByTestId("fixture-card-theme").click();
  await expect(themeLabel).toContainText("theme:ocean");
  await fixtureSectionCard.getByTestId("fixture-card-details").click();
  await expect(signalScore).not.toBeVisible();
  await fixtureSectionCard.getByTestId("fixture-card-details").click();
  await expect(signalScore).toBeVisible();

  await postBackend(page, "/plugins/disable", {
    pluginId: "setta-fixture-frontend",
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");

  await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy Section JSON", exact: true }),
  ).toBeVisible();

  await setOverviewTab(page, "Plugins");
  const enableFromStatusButton = page.getByTestId(
    "plugin-status-enable-setta-fixture-frontend",
  );
  await expect(enableFromStatusButton).toBeVisible();
  await enableFromStatusButton.click();
  await expect(page.getByText("Enable plugin completed.")).toBeVisible();
  await expect(
    page.getByTestId("plugin-status-disable-setta-fixture-frontend"),
  ).toBeVisible();

  const frontendPluginCardAfterEnable = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-frontend@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(frontendPluginCardAfterEnable).toBeVisible();
  await expect(
    frontendPluginCardAfterEnable.getByRole("button", {
      name: "Open Fixture Pane",
      exact: true,
    }),
  ).toBeVisible();

  await page.getByTestId("overview-tab-overview").click();
  await expect(page.getByText("Fixture Plugin Card")).toBeVisible();
});

test("plugins pane shows install confirmation trust and provenance summary", async ({
  page,
}) => {
  const installRequests: Array<Record<string, unknown>> = [];
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/install", async (route) => {
    const requestPayload = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    installRequests.push(requestPayload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pluginId: "setta-fixture-install",
        version: "0.1.0",
        sourceScope: "setta_files",
        sourceScopeLabel: "setta_files",
        sourcePath: "/tmp/setta-fixture-install",
        canonicalSourceKey: "pypi:setta-fixture-install",
        sourceDigestSha256: "sha256:fixture",
        requestedCapabilities: ["writeWorkspacePlugins", "registerPane"],
        trustStatus: "unverified",
        trustWarning: "Source is unverified. Install only from trusted owners.",
        components: ["backend", "frontend"],
        state: "pending_restart",
        restartRequired: true,
      }),
    });
  });

  await page.getByTestId("plugin-install-scope").selectOption("setta_files");
  await page.getByTestId("plugin-install-installer").selectOption("uv");
  await page
    .getByPlaceholder("github:owner/repo[#ref] or pypi:package[==version]")
    .fill("pypi:setta-fixture-install==0.1.0");
  await page.getByRole("button", { name: "Install", exact: true }).click();

  await expect.poll(() => installRequests.length).toBe(1);
  expect(installRequests[0].scope).toBe("setta_files");
  expect(installRequests[0].installer).toBe("uv");

  const confirmation = page.getByTestId("plugin-install-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText("Install Confirmation")).toBeVisible();
  await expect(
    confirmation.getByText("setta-fixture-install@0.1.0"),
  ).toBeVisible();
  await expect(
    confirmation.getByText(
      "scope=setta_files source=pypi:setta-fixture-install",
    ),
  ).toBeVisible();
  await expect(
    confirmation.getByText("requested=registerPane, writeWorkspacePlugins"),
  ).toBeVisible();
  await expect(
    confirmation.getByText("sourceDigestSha256=sha256:fixture"),
  ).toBeVisible();
  await expect(
    confirmation.getByText(
      "Trust (unverified): Source is unverified. Install only from trusted owners.",
    ),
  ).toBeVisible();
});

test("plugins pane fails fast on runtime endpoint errors without list/status fallback", async ({
  page,
}) => {
  let listCalls = 0;
  let statusCalls = 0;
  allowExpectedApiError(page, {
    path: "/api/plugins/runtime",
    method: "GET",
    statuses: [503],
    count: 5,
  });

  await page.route("**/api/plugins/runtime", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "PLUGIN_RUNTIME_UNAVAILABLE",
        message: "Runtime endpoint unavailable.",
      }),
    });
  });
  await page.route("**/api/plugins/list", async (route) => {
    listCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        serverMode: "ide",
        restartCapability: {
          mode: "manual",
          command: "setta",
          reason: "Programmatic restart is not available in this runtime.",
        },
        plugins: [],
      }),
    });
  });
  await page.route("**/api/plugins/status", async (route) => {
    statusCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        serverMode: "ide",
        plugins: [],
      }),
    });
  });

  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);
  await expect(page.getByText("Plugin Runtime")).toBeVisible();
  await expect(
    page.getByText("Failed to fetch plugins runtime: status 503."),
  ).toBeVisible();
  expect(listCalls).toBe(0);
  expect(statusCalls).toBe(0);
});

test("plugins pane reports partial success when runtime refresh fails after an action", async ({
  page,
}) => {
  let runtimeCalls = 0;
  allowExpectedApiError(page, {
    path: "/api/plugins/runtime",
    method: "GET",
    statuses: [503],
    count: 1,
  });

  await page.route("**/api/plugins/runtime", async (route) => {
    runtimeCalls += 1;
    if (runtimeCalls === 1) {
      const response = await route.fetch();
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "PLUGIN_RUNTIME_UNAVAILABLE",
        message: "Runtime endpoint unavailable.",
      }),
    });
  });

  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);
  await expect(page.getByText("Plugin Runtime")).toBeVisible();

  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect(
    page.getByText(
      "Rescan plugins completed, but runtime refresh failed: Failed to fetch plugins runtime: status 503.",
    ),
  ).toBeVisible();
});

test("plugins pane shows package-manager guidance and disables managed write actions", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/runtime", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.list.plugins = [
      {
        pluginId: "setta-package-managed",
        name: "Setta Package Managed",
        version: "0.1.0",
        sourceScope: "setta_files",
        sourceScopeLabel: "setta_files",
        sourceManager: "package_manager",
        sourceManagerHint:
          "Managed by Python package manager in active environment. Use uv/pip/Poetry to install, update, or remove.",
        canonicalSourceKey: "pypi:setta-package-managed",
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
        },
        effectiveCapabilities: [],
        restartRequired: false,
      },
    ];
    payload.status.plugins = [
      {
        pluginId: "setta-package-managed",
        name: "Setta Package Managed",
        version: "0.1.0",
        state: "active",
        sourceScope: "setta_files",
        sourceScopeLabel: "setta_files",
        sourceManager: "package_manager",
        sourceManagerHint:
          "Managed by Python package manager in active environment. Use uv/pip/Poetry to install, update, or remove.",
        sourcePath: "/tmp/site-packages/setta-package-managed",
        canonicalSourceKey: "pypi:setta-package-managed",
        sourceDigestSha256: "digest",
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
    ];
    await route.fulfill({ response, json: payload });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");

  const pluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-package-managed@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(pluginCard).toBeVisible();
  await expect(
    page.getByTestId("plugin-package-manager-guidance-setta-package-managed"),
  ).toContainText("Managed by package manager");
  await expect(
    page.getByTestId("plugin-package-manager-guidance-setta-package-managed"),
  ).toContainText("Use uv/pip/Poetry to install, update, or remove");
  await expect(
    pluginCard.getByRole("button", { name: "Update", exact: true }),
  ).toBeDisabled();
  await expect(
    pluginCard.getByRole("button", { name: "Rollback", exact: true }),
  ).toBeDisabled();
  await expect(
    pluginCard.getByRole("button", { name: "Uninstall", exact: true }),
  ).toBeDisabled();
});

test("plugins pane shows mode-policy blocked capability reasons", async ({
  page,
}) => {
  const backendFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend",
  );
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

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
    payload.list.serverMode = "share";
    payload.list.plugins = payload.list.plugins.map(
      (plugin: { pluginId: string; effectiveCapabilities: string[] }) => {
        if (plugin.pluginId !== "setta-fixture-backend") {
          return plugin;
        }
        return {
          ...plugin,
          effectiveCapabilities: [],
        };
      },
    );
    payload.status.serverMode = "share";
    payload.status.plugins = payload.status.plugins.map(
      (plugin: {
        pluginId: string;
        requestedCapabilities: string[];
        effectiveCapabilities: string[];
        blockedCapabilities: Array<{ capability: string; reason: string }>;
      }) => {
        if (plugin.pluginId !== "setta-fixture-backend") {
          return plugin;
        }
        return {
          ...plugin,
          requestedCapabilities: ["writeWorkspacePlugins"],
          effectiveCapabilities: [],
          blockedCapabilities: [
            { capability: "writeWorkspacePlugins", reason: "mode_policy" },
          ],
        };
      },
    );
    await route.fulfill({ response, json: payload });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");

  const backendPluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-backend@0.1.0",
        exact: true,
      }),
    })
    .first();

  await expect(backendPluginCard.getByText("Capabilities")).toBeVisible();
  await expect(
    backendPluginCard.getByText("writeWorkspacePlugins (mode_policy)"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Plugin install/uninstall/update actions are IDE-mode only.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rescan", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Restart Setta", exact: true }),
  ).toBeDisabled();
});

test("plugins pane lifecycle actions call update rollback and uninstall endpoints", async ({
  page,
}) => {
  const updateRequests: Array<Record<string, unknown>> = [];
  const rollbackRequests: Array<Record<string, unknown>> = [];
  const uninstallRequests: Array<Record<string, unknown>> = [];
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
    updateRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pluginId: "setta-lifecycle-plugin",
        fromVersion: "0.1.0",
        toVersion: "0.1.1",
        sourceDigestSha256: "digest-v2",
        restartRequired: false,
      }),
    });
  });

  await page.route("**/api/plugins/rollback", async (route) => {
    rollbackRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pluginId: "setta-lifecycle-plugin",
        restoredVersion: "0.1.0",
        sourceDigestSha256: "digest-v1",
        restartRequired: false,
      }),
    });
  });

  await page.route("**/api/plugins/uninstall", async (route) => {
    uninstallRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pluginId: "setta-lifecycle-plugin",
        removedFromScope: "workspace",
        restartRequired: false,
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

  await pluginCard.getByRole("button", { name: "Update", exact: true }).click();
  await expect.poll(() => updateRequests.length).toBe(1);
  expect(updateRequests[0]).toMatchObject({
    pluginId: "setta-lifecycle-plugin",
    scope: "workspace",
    to: null,
  });
  await expect(page.getByText("Update plugin completed.")).toBeVisible();

  await pluginCard
    .getByRole("button", { name: "Rollback", exact: true })
    .click();
  await expect.poll(() => rollbackRequests.length).toBe(1);
  expect(rollbackRequests[0]).toMatchObject({
    pluginId: "setta-lifecycle-plugin",
    scope: "workspace",
  });
  await expect(page.getByText("Rollback plugin completed.")).toBeVisible();

  await pluginCard
    .getByRole("button", { name: "Uninstall", exact: true })
    .click();
  await expect.poll(() => uninstallRequests.length).toBe(1);
  expect(uninstallRequests[0]).toMatchObject({
    pluginId: "setta-lifecycle-plugin",
    scope: "workspace",
  });
  await expect(page.getByText("Uninstall plugin completed.")).toBeVisible();
});

test("plugins pane keeps unrelated plugin actions enabled while one action is in flight", async ({
  page,
}) => {
  const updateRequests: Array<Record<string, unknown>> = [];
  const disableRequests: Array<Record<string, unknown>> = [];
  let releaseUpdateRequest: (() => void) | null = null;
  const waitForUpdateRelease = new Promise<void>((resolve) => {
    releaseUpdateRequest = resolve;
  });

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
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
              {
                pluginId: "setta-other-plugin",
                name: "Setta Other Plugin",
                version: "0.2.0",
                sourceScope: "workspace",
                sourceScopeLabel: "workspace",
                sourceManager: "setta",
                sourceManagerHint: null,
                canonicalSourceKey: "pypi:setta-other-plugin",
                sourceDigestSha256: "digest-v2",
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
              {
                pluginId: "setta-other-plugin",
                name: "Setta Other Plugin",
                version: "0.2.0",
                state: "active",
                sourceScope: "workspace",
                sourceScopeLabel: "workspace",
                sourceManager: "setta",
                sourceManagerHint: null,
                sourcePath: "/tmp/setta-other-plugin",
                canonicalSourceKey: "pypi:setta-other-plugin",
                sourceDigestSha256: "digest-v2",
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
      updateRequests.push(
        route.request().postDataJSON() as Record<string, unknown>,
      );
      await waitForUpdateRelease;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pluginId: "setta-lifecycle-plugin",
          fromVersion: "0.1.0",
          toVersion: "0.1.1",
          sourceDigestSha256: "digest-v2",
          restartRequired: false,
        }),
      });
    });

    await page.route("**/api/plugins/disable", async (route) => {
      disableRequests.push(
        route.request().postDataJSON() as Record<string, unknown>,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pluginId: "setta-other-plugin",
          state: "disabled",
          restartRequired: false,
        }),
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const pluginACard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-lifecycle-plugin@0.1.0",
          exact: true,
        }),
      })
      .first();
    const pluginBCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-other-plugin@0.2.0",
          exact: true,
        }),
      })
      .first();

    const updateButton = pluginACard.getByRole("button", {
      name: "Update",
      exact: true,
    });
    const pluginADisableButton = pluginACard.getByRole("button", {
      name: "Disable",
      exact: true,
    });
    const disableButton = pluginBCard.getByRole("button", {
      name: "Disable",
      exact: true,
    });

    await updateButton.click();
    await expect.poll(() => updateRequests.length).toBe(1);
    await expect(updateButton).toBeDisabled();
    await expect(pluginADisableButton).toBeDisabled();
    await expect(disableButton).toBeEnabled();

    await disableButton.click();
    await expect.poll(() => disableRequests.length).toBe(1);
    expect(disableRequests[0]).toMatchObject({
      pluginId: "setta-other-plugin",
    });

    releaseUpdateRequest?.();
    await expect(page.getByText("Update plugin completed.")).toBeVisible();
  } finally {
    releaseUpdateRequest?.();
    await cleanupIsolatedProject(page, projectContext);
  }
});
