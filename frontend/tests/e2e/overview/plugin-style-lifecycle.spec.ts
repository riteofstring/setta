import { expect, test } from "@playwright/test";
import path from "path";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

test("plugin stylesheet links follow plugin lifecycle state", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  const styleLink = page.locator(
    "head link[data-setta-plugin-id='setta-fixture-frontend'][data-setta-plugin-style='true']",
  );

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(styleLink).toHaveCount(1);
    await expect(styleLink.first()).toHaveAttribute(
      "href",
      /setta-fixture-frontend\/frontend\/dist\/index\.css/,
    );

    await postBackend(page, "/plugins/disable", {
      pluginId: "setta-fixture-frontend",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(styleLink).toHaveCount(0);

    await postBackend(page, "/plugins/enable", {
      pluginId: "setta-fixture-frontend",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(styleLink).toHaveCount(1);

    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(styleLink).toHaveCount(0);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("failed plugin frontend loads do not keep stylesheet links mounted", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-errors",
  );
  const styleLink = page.locator(
    "head link[data-setta-plugin-id='setta-fixture-frontend-errors'][data-setta-plugin-style='true']",
  );

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(styleLink).toHaveCount(0);
    await expect(
      page.getByText("setta-fixture-frontend-errors@0.1.0"),
    ).toBeVisible();
    await expect(
      page.getByText("Frontend load failed", { exact: true }),
    ).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-errors",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("runtime refresh errors clear plugin styles and the next success restores them", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  const styleLink = page.locator(
    "head link[data-setta-plugin-id='setta-fixture-frontend'][data-setta-plugin-style='true']",
  );

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(styleLink).toHaveCount(1);

    allowExpectedApiError(page, {
      path: "/api/plugins/runtime",
      method: "GET",
      statuses: [503],
      count: 1,
    });

    let runtimeCalls = 0;
    await page.route("**/api/plugins/runtime", async (route) => {
      runtimeCalls += 1;
      if (runtimeCalls === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: "PLUGIN_RUNTIME_UNAVAILABLE",
            message: "Runtime endpoint unavailable.",
          }),
        });
        return;
      }
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await page.getByRole("button", { name: "Rescan", exact: true }).click();
    await expect(
      page.getByText(
        "Rescan plugins completed, but runtime refresh failed: Failed to fetch plugins runtime: status 503.",
      ),
    ).toBeVisible();
    await expect(styleLink).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect.poll(() => runtimeCalls).toBe(2);
    await expect(styleLink).toHaveCount(1);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
