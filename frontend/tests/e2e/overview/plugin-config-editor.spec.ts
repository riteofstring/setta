import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test("plugin config editor saves valid JSON and rejects invalid JSON drafts", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/full",
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

    await page.goto(new URL("/settings", BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".react-flow__pane");

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-full@0.1.0",
          exact: true,
        }),
      })
      .first();

    await expect(pluginCard).toBeVisible();
    await expect(pluginCard.getByText("Plugin Config", { exact: true })).toBeVisible();

    const configTextarea = pluginCard.locator("textarea").first();
    await configTextarea.fill("{");
    await pluginCard
      .getByRole("button", { name: "Save Plugin Config", exact: true })
      .click();
    await expect(
      pluginCard
        .getByText("Plugin config JSON is invalid.", { exact: true })
        .first(),
    ).toBeVisible();

    await configTextarea.fill('{"enabled": true, "label": "Fixture Config"}');
    await pluginCard
      .getByRole("button", { name: "Save Plugin Config", exact: true })
      .click();
    await expect(
      pluginCard.getByText("Plugin config saved.", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-full",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin config persists across reload and disable/enable lifecycle", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/full",
  );
  const persistedConfig = {
    enabled: true,
    label: "Persist Across Lifecycle",
  };

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

    await page.goto(new URL("/settings", BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".react-flow__pane");

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-full@0.1.0",
          exact: true,
        }),
      })
      .first();

    await expect(pluginCard).toBeVisible();
    const configTextarea = pluginCard.locator("textarea").first();
    await configTextarea.fill(JSON.stringify(persistedConfig));
    await pluginCard
      .getByRole("button", { name: "Save Plugin Config", exact: true })
      .click();
    await expect(
      pluginCard.getByText("Plugin config saved.", { exact: true }).first(),
    ).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const reloadedTextarea = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-full@0.1.0",
          exact: true,
        }),
      })
      .first()
      .locator("textarea")
      .first();
    const reloadedConfig = JSON.parse(await reloadedTextarea.inputValue()) as {
      enabled: boolean;
      label: string;
    };
    expect(reloadedConfig).toEqual(persistedConfig);

    await postBackend(page, "/plugins/disable", {
      pluginId: "setta-fixture-full",
    });
    await postBackend(page, "/plugins/rescan", {});
    await postBackend(page, "/plugins/enable", {
      pluginId: "setta-fixture-full",
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.goto(new URL("/settings", BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".react-flow__pane");
    const lifecycleTextarea = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-full@0.1.0",
          exact: true,
        }),
      })
      .first()
      .locator("textarea")
      .first();
    const lifecycleConfig = JSON.parse(await lifecycleTextarea.inputValue()) as {
      enabled: boolean;
      label: string;
    };
    expect(lifecycleConfig).toEqual(persistedConfig);
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-full",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
