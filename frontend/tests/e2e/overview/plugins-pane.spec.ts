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
  await expect(page.locator("select").first()).toHaveValue("workspace");
  await expect(page.locator("select option[value='workspace']")).toHaveText(
    "workspace",
  );
  await expect(page.locator("select option[value='environment']")).toHaveText(
    "environment",
  );
  await expect(page.locator("select option[value='global']")).toHaveText(
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
  await expect(page.getByText("Restart required for 1 plugin")).toBeVisible();

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
