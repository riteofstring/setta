import { expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

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
    await expect(
      workspaceCard.getByRole("button", { name: "Update", exact: true }),
    ).toBeDisabled();
    await expect(
      workspaceCard.getByRole("button", { name: "Rollback", exact: true }),
    ).toBeDisabled();
    await expect(workspaceCard).toContainText("Linked local plugin");

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
  type PluginsRuntimePayload = {
    list: {
      plugins: Array<{
        pluginId: string;
        frontend: {
          entrypointUrl: string | null;
        };
      }>;
    };
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

    const firstRuntimeResponse = await page.request.get(
      `${BACKEND_ORIGIN}/api/plugins/runtime`,
    );
    expect(firstRuntimeResponse.ok()).toBeTruthy();
    const firstRuntimePayload =
      (await firstRuntimeResponse.json()) as PluginsRuntimePayload;
    const firstEntry = firstRuntimePayload.list.plugins.find(
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

    const secondRuntimeResponse = await page.request.get(
      `${BACKEND_ORIGIN}/api/plugins/runtime`,
    );
    expect(secondRuntimeResponse.ok()).toBeTruthy();
    const secondRuntimePayload =
      (await secondRuntimeResponse.json()) as PluginsRuntimePayload;
    const secondEntry = secondRuntimePayload.list.plugins.find(
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
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
    fs.rmSync(tempPluginRoot, { recursive: true, force: true });
  }
});
