import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

test("plugin stylesheet links follow plugin lifecycle state", async ({ page }) => {
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

    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(styleLink).toHaveCount(0);
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
