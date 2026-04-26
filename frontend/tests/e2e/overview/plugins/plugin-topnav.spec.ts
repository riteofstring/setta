import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

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
    await page.waitForSelector(".canvas-flow__canvas");

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
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-topnav",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin top-nav busy state only disables the active item", async ({
  page,
}) => {
  const baseFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-topnav",
  );
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "setta-topnav-concurrency-"),
  );
  const fixturePluginRoot = path.join(tempRoot, "plugin");
  await fs.cp(baseFixturePluginRoot, fixturePluginRoot, { recursive: true });
  const manifestPath = path.join(fixturePluginRoot, "setta.plugin.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
    id: string;
    name: string;
  };
  const pluginId = `setta-fixture-frontend-topnav-${randomUUID().slice(0, 8)}`;
  manifest.id = pluginId;
  manifest.name = "Fixture Top Nav Concurrency";
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  await fs.writeFile(
    path.join(fixturePluginRoot, "frontend", "dist", "index.js"),
    [
      "export const apiVersion = 1;",
      "",
      "export function register(host) {",
      "  const effective = new Set(host.effectiveCapabilities || []);",
      "  if (!effective.has('registerTopNavBarItem')) {",
      "    return;",
      "  }",
      "  host.registerTopNavBarItem({",
      "    id: 'slow-action',",
      "    label: 'Fixture Slow Nav',",
      "    onClick() {",
      "      const current = Number(window.__settaFixtureSlowNavCalls || 0);",
      "      window.__settaFixtureSlowNavCalls = current + 1;",
      "      return new Promise((resolve) => {",
      "        window.__settaFixtureSlowNavResolve = resolve;",
      "      });",
      "    },",
      "  });",
      "  host.registerTopNavBarItem({",
      "    id: 'fast-action',",
      "    label: 'Fixture Fast Nav',",
      "    onClick() {",
      "      const current = Number(window.__settaFixtureFastNavClicks || 0);",
      "      window.__settaFixtureFastNavClicks = current + 1;",
      "    },",
      "  });",
      "}",
      "",
    ].join("\n"),
    "utf-8",
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
    await page.waitForSelector(".canvas-flow__canvas");

    const slowButton = page.getByRole("button", {
      name: "Fixture Slow Nav",
      exact: true,
    });
    const fastButton = page.getByRole("button", {
      name: "Fixture Fast Nav",
      exact: true,
    });
    await expect(slowButton).toBeVisible();
    await expect(fastButton).toBeVisible();

    await slowButton.evaluate((button) => {
      button.click();
      button.click();
    });
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          return Number(
            (window as { __settaFixtureSlowNavCalls?: number })
              .__settaFixtureSlowNavCalls || 0,
          );
        });
      })
      .toBe(1);
    await expect(slowButton).toBeDisabled();
    await expect(fastButton).toBeEnabled();

    await fastButton.click();
    const fastClickCount = await page.evaluate(() => {
      return Number(
        (window as { __settaFixtureFastNavClicks?: number })
          .__settaFixtureFastNavClicks || 0,
      );
    });
    expect(fastClickCount).toBe(1);
    await expect(slowButton).toBeDisabled();

    await page.evaluate(() => {
      const resolver = (
        window as { __settaFixtureSlowNavResolve?: (() => void) | undefined }
      ).__settaFixtureSlowNavResolve;
      if (typeof resolver === "function") {
        resolver();
      }
    });
    await expect(slowButton).toBeEnabled();
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId,
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("plugin disable and uninstall clear top-nav and pane actions after rescan", async ({
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
    await page.waitForSelector(".canvas-flow__canvas");

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
    await page.waitForSelector(".canvas-flow__canvas");

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

    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-topnav",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas-flow__canvas");

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
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-topnav",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
