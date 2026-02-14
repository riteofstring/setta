import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

test("plugin top-nav fixture button click updates frontend side effect", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-topnav",
  );
  const projectContext = await openIsolatedProject(page);

  try {
    await setOverviewTab(page, "Plugins");

    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const topNavButton = page.getByRole("button", {
      name: "Fixture Nav",
      exact: true,
    });
    await expect(topNavButton).toBeVisible();

    await topNavButton.click();
    await topNavButton.click();

    const clickCount = await page.evaluate(() => {
      return Number(
        (window as { __settaFixtureTopNavClicks?: number })
          .__settaFixtureTopNavClicks || 0,
      );
    });
    expect(clickCount).toBe(2);
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend-topnav",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin disable and unlink clear top-nav and pane actions after rescan", async ({
  page,
}) => {
  const topNavFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-topnav",
  );
  const paneFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  const projectContext = await openIsolatedProject(page);

  try {
    await setOverviewTab(page, "Plugins");
    await postBackend(page, "/plugins/link", {
      localPluginRoot: topNavFixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/link", {
      localPluginRoot: paneFixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByRole("button", {
        name: "Fixture Nav",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open Fixture Pane",
        exact: true,
      }),
    ).toBeVisible();

    await postBackend(page, "/plugins/disable", {
      pluginId: "setta-fixture-frontend-topnav",
    });
    await postBackend(page, "/plugins/disable", {
      pluginId: "setta-fixture-frontend",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByRole("button", {
        name: "Fixture Nav",
        exact: true,
      }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open Fixture Pane",
        exact: true,
      }),
    ).not.toBeVisible();

    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend-topnav",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(
      page.getByRole("button", {
        name: "Fixture Nav",
        exact: true,
      }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open Fixture Pane",
        exact: true,
      }),
    ).not.toBeVisible();
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend-topnav",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
