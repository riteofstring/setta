import { expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId: string;
};
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

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
  await expect(page.getByText("Install Plugin")).toBeVisible();
  await expect(page.getByText("restart capability: manual")).toBeVisible();
  await page
    .getByRole("button", { name: "Restart Setta", exact: true })
    .click();
  await expect(
    page.getByText(
      "Manual restart required: setta. Programmatic restart is not available in this runtime.",
    ),
  ).toBeVisible();
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
      .locator("option[value='environment']"),
  ).toHaveText("environment");
  await expect(
    page.getByTestId("plugin-install-scope").locator("option[value='global']"),
  ).toHaveText("global");
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
  await page.waitForSelector(".react-flow__pane");
  await expect(
    page.getByText(/^Restart required for \d+ plugins?$/),
  ).toBeVisible();
  await expect(
    page.getByText("Backend changes are pending for: setta-fixture-backend"),
  ).toBeVisible();

  await postBackend(page, "/plugins/link", {
    localPluginRoot: fixturePluginRoot,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
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
  await page.locator("#overview-tab-overview").click();
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

  await page.keyboard.press("Meta+Shift+P");
  await page.locator("#ProjectPageSearchBar").fill("Fixture Command");
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
  expect(commandRunCount).toBeGreaterThan(0);

  await page.locator("#overview-tab-plugins").click();
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

  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
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
    },
  );
  expect(created?.sectionId).toBeTruthy();

  await expect(page.getByText("Fixture Plugin Card")).toBeVisible();
  await expect(page.getByText("fixture:hello plugin")).toBeVisible();

  await postBackend(page, "/plugins/disable", {
    pluginId: "setta-fixture-frontend",
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");

  await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy Section JSON", exact: true }),
  ).toBeVisible();
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
        sourceScope: "global",
        sourceScopeLabel: "global",
        sourcePath: "/tmp/setta-fixture-install",
        canonicalSourceKey: "pypi:setta-fixture-install",
        sourceDigestSha256: "sha256:fixture",
        requestedCapabilities: ["registerPane", "registerMcpTools"],
        trustStatus: "unverified",
        trustWarning: "Source is unverified. Install only from trusted owners.",
        components: ["backend", "frontend"],
        state: "pending_restart",
        restartRequired: true,
      }),
    });
  });

  await page.getByTestId("plugin-install-scope").selectOption("global");
  await page.getByTestId("plugin-install-installer").selectOption("uv");
  await page
    .getByPlaceholder("github:owner/repo[#ref] or pypi:package[==version]")
    .fill("pypi:setta-fixture-install==0.1.0");
  await page.getByRole("button", { name: "Install", exact: true }).click();

  await expect.poll(() => installRequests.length).toBe(1);
  expect(installRequests[0].scope).toBe("global");
  expect(installRequests[0].installer).toBe("uv");

  const confirmation = page.getByTestId("plugin-install-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText("Install Confirmation")).toBeVisible();
  await expect(
    confirmation.getByText("setta-fixture-install@0.1.0"),
  ).toBeVisible();
  await expect(
    confirmation.getByText("scope=global source=pypi:setta-fixture-install"),
  ).toBeVisible();
  await expect(
    confirmation.getByText("requested=registerMcpTools, registerPane"),
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

test("plugins pane shows package-manager guidance and disables managed write actions", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/list", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.plugins = [
      {
        pluginId: "setta-package-managed",
        name: "Setta Package Managed",
        version: "0.1.0",
        sourceScope: "setta_files",
        sourceScopeLabel: "environment",
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
    await route.fulfill({ response, json: payload });
  });
  await page.route("**/api/plugins/status", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.plugins = [
      {
        pluginId: "setta-package-managed",
        name: "Setta Package Managed",
        version: "0.1.0",
        state: "active",
        sourceScope: "setta_files",
        sourceScopeLabel: "environment",
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
  await page.waitForSelector(".react-flow__pane");

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

  await page.route("**/api/plugins/list", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.serverMode = "share";
    payload.plugins = payload.plugins.map(
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
    await route.fulfill({ response, json: payload });
  });
  await page.route("**/api/plugins/status", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.serverMode = "share";
    payload.plugins = payload.plugins.map(
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
          requestedCapabilities: ["registerRouter", "registerMcpTools"],
          effectiveCapabilities: [],
          blockedCapabilities: [
            { capability: "registerMcpTools", reason: "mode_policy" },
            { capability: "registerRouter", reason: "mode_policy" },
          ],
        };
      },
    );
    await route.fulfill({ response, json: payload });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");

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
    backendPluginCard.getByText("registerMcpTools (mode_policy)"),
  ).toBeVisible();
  await expect(
    backendPluginCard.getByText("registerRouter (mode_policy)"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Plugin install/uninstall/update actions are IDE-mode only.",
    ),
  ).toBeVisible();
});

test("plugins pane lifecycle actions call update rollback and uninstall endpoints", async ({
  page,
}) => {
  const updateRequests: Array<Record<string, unknown>> = [];
  const rollbackRequests: Array<Record<string, unknown>> = [];
  const uninstallRequests: Array<Record<string, unknown>> = [];
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/list", async (route) => {
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
      }),
    });
  });

  await page.route("**/api/plugins/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
  await page.waitForSelector(".react-flow__pane");

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

test("plugins pane update and rollback actions work against real backend endpoints", async ({
  page,
}) => {
  const packageName = "setta-fixture-frontend";
  const version = "0.1.0";

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/install", {
      sourceSpec: `pypi:${packageName}==${version}`,
      scope: "workspace",
      installer: "pip",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-frontend@0.1.0",
          exact: true,
        }),
      })
      .first();
    await expect(pluginCard).toBeVisible();

    await pluginCard
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await expect(page.getByText("Update plugin completed.")).toBeVisible();

    const refreshedPluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-frontend@0.1.0",
          exact: true,
        }),
      })
      .first();
    await refreshedPluginCard
      .getByRole("button", { name: "Rollback", exact: true })
      .click();
    await expect(page.getByText("Rollback plugin completed.")).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: packageName,
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugins pane lifecycle actions work against real backend endpoints", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await postBackend(page, "/plugins/link", {
    localPluginRoot: fixturePluginRoot,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");

  const pluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-frontend@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(pluginCard).toBeVisible();

  await pluginCard.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText("Enable plugin completed.")).toBeVisible();

  await pluginCard
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  await expect(page.getByText("Disable plugin completed.")).toBeVisible();

  await postBackend(page, "/plugins/enable", {
    pluginId: "setta-fixture-frontend",
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");

  const reenabledPluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-frontend@0.1.0",
        exact: true,
      }),
    })
    .first();
  await expect(reenabledPluginCard).toBeVisible();

  await reenabledPluginCard
    .getByRole("button", { name: "Uninstall", exact: true })
    .click();
  await expect(page.getByText("Uninstall plugin completed.")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "setta-fixture-frontend@0.1.0",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("plugins pane supports scope shadowing and scope-specific uninstall", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "global",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const workspaceCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-frontend@0.1.0",
          exact: true,
        }),
      })
      .first();
    await expect(workspaceCard).toContainText("scope=workspace source=local:");

    const statusRows = page
      .locator("tbody tr")
      .filter({ hasText: "setta-fixture-frontend" });
    await expect(statusRows).toHaveCount(2);
    await expect(
      statusRows.filter({ hasText: "active" }).filter({ hasText: "workspace" }),
    ).toHaveCount(1);
    await expect(
      statusRows.filter({ hasText: "shadowed" }).filter({ hasText: "global" }),
    ).toHaveCount(1);

    await workspaceCard
      .getByRole("button", { name: "Uninstall", exact: true })
      .click();
    await expect(page.getByText("Uninstall plugin completed.")).toBeVisible();

    const globalCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-frontend@0.1.0",
          exact: true,
        }),
      })
      .first();
    await expect(globalCard).toContainText("scope=global source=local:");

    const refreshedStatusRows = page
      .locator("tbody tr")
      .filter({ hasText: "setta-fixture-frontend" });
    await expect(refreshedStatusRows).toHaveCount(1);
    await expect(refreshedStatusRows.first()).toContainText("active");
    await expect(refreshedStatusRows.first()).toContainText("global");
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "global",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugins pane updates frontend asset digest query after relink", async ({
  page,
}) => {
  type PluginsListPayload = {
    plugins: Array<{
      pluginId: string;
      frontend: {
        entrypointUrl: string | null;
      };
    }>;
  };

  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  const tempPluginRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "setta-plugin-cache-bust-"),
  );
  const mutablePluginRoot = path.join(tempPluginRoot, "frontend-plugin");
  fs.cpSync(fixturePluginRoot, mutablePluginRoot, { recursive: true });

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: mutablePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const firstListResponse = await page.request.get(
      `${BACKEND_ORIGIN}/api/plugins/list`,
    );
    expect(firstListResponse.ok()).toBeTruthy();
    const firstListPayload =
      (await firstListResponse.json()) as PluginsListPayload;
    const firstEntry = firstListPayload.plugins.find(
      (plugin) => plugin.pluginId === "setta-fixture-frontend",
    );
    const firstEntrypointUrl = firstEntry?.frontend.entrypointUrl;
    expect(firstEntrypointUrl).toBeTruthy();
    const firstDigest = new URL(
      firstEntrypointUrl as string,
      BACKEND_ORIGIN,
    ).searchParams.get("v");
    expect(firstDigest).toBeTruthy();

    const entrypointPath = path.join(
      mutablePluginRoot,
      "frontend",
      "dist",
      "index.js",
    );
    fs.appendFileSync(entrypointPath, "\n// e2e digest cache bust marker\n");

    await postBackend(page, "/plugins/link", {
      localPluginRoot: mutablePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const secondListResponse = await page.request.get(
      `${BACKEND_ORIGIN}/api/plugins/list`,
    );
    expect(secondListResponse.ok()).toBeTruthy();
    const secondListPayload =
      (await secondListResponse.json()) as PluginsListPayload;
    const secondEntry = secondListPayload.plugins.find(
      (plugin) => plugin.pluginId === "setta-fixture-frontend",
    );
    const secondEntrypointUrl = secondEntry?.frontend.entrypointUrl;
    expect(secondEntrypointUrl).toBeTruthy();
    const secondDigest = new URL(
      secondEntrypointUrl as string,
      BACKEND_ORIGIN,
    ).searchParams.get("v");
    expect(secondDigest).toBeTruthy();
    expect(secondDigest).not.toBe(firstDigest);
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
    fs.rmSync(tempPluginRoot, { recursive: true, force: true });
  }
});

test("plugins pane supports programmatic restart action", async ({ page }) => {
  const restartRequests: Array<Record<string, unknown>> = [];
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/list", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        serverMode: "ide",
        restartCapability: {
          mode: "programmatic",
          command: null,
          reason: null,
        },
        plugins: [],
      }),
    });
  });

  await page.route("**/api/plugins/status", async (route) => {
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

  await page.route("**/api/plugins/restart", async (route) => {
    restartRequests.push({});
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

  await page
    .getByRole("button", { name: "Restart Setta", exact: true })
    .click();
  await expect.poll(() => restartRequests.length).toBe(1);
  await expect(
    page
      .locator("section")
      .filter({ hasText: "Restart request accepted." })
      .first(),
  ).toBeVisible();
});

test("plugins pane shows restart rejection and request-failure messaging", async ({
  page,
}) => {
  let restartRequestCount = 0;
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/list", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        serverMode: "ide",
        restartCapability: {
          mode: "programmatic",
          command: null,
          reason: null,
        },
        plugins: [],
      }),
    });
  });

  await page.route("**/api/plugins/status", async (route) => {
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
  await page.waitForSelector(".react-flow__pane");

  const restartButton = page.getByRole("button", {
    name: "Restart Setta",
    exact: true,
  });
  await restartButton.click();
  await expect.poll(() => restartRequestCount).toBe(1);
  await expect(
    page.getByText(
      "Manual restart required: setta restart. Programmatic restart request was rejected.",
      { exact: true },
    ),
  ).toBeVisible();

  await restartButton.click();
  await expect.poll(() => restartRequestCount).toBe(2);
  await expect(
    page
      .getByText(/Restart plugins runtime failed/, {
        exact: false,
      })
      .first(),
  ).toBeVisible();
});

test("plugins pane lifecycle action failures surface structured endpoint errors", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/list", async (route) => {
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
      }),
    });
  });

  await page.route("**/api/plugins/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
  await page.waitForSelector(".react-flow__pane");

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
  await expect(
    page
      .getByText(
        "Update plugin failed: PLUGIN_UPDATE_UNAVAILABLE - No update target available.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
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
  const statusPlugins = Array.from({ length: pluginCount }, (_unused, index) => ({
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
  }));

  await setOverviewTab(page, "Plugins");
  await openIsolatedProject(page);

  await page.route("**/api/plugins/list", async (route) => {
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
        plugins: listPlugins,
      }),
    });
  });

  await page.route("**/api/plugins/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        serverMode: "ide",
        plugins: statusPlugins,
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
  await page.waitForSelector(".react-flow__pane");
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
