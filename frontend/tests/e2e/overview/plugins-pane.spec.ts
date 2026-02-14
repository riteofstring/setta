import { expect, test } from "@playwright/test";
import path from "path";
import {
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId: string;
};

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
    page.getByTestId("plugin-install-scope").locator("option[value='workspace']"),
  ).toHaveText(
    "workspace",
  );
  await expect(
    page.getByTestId("plugin-install-scope").locator("option[value='environment']"),
  ).toHaveText(
    "environment",
  );
  await expect(
    page.getByTestId("plugin-install-scope").locator("option[value='global']"),
  ).toHaveText(
    "global",
  );
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
