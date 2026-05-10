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

    const backendOrigin = process.env.SETTA_BACKEND_ORIGIN;
    if (!backendOrigin) {
      throw new Error("SETTA_BACKEND_ORIGIN is required for this test.");
    }
    const loadSettingsResponse = await page.request.post(
      `${backendOrigin}/api/loadSettings`,
      {
        data: null,
      },
    );
    expect(loadSettingsResponse.ok()).toBe(true);
    const settingsDocument = (await loadSettingsResponse.json()) as unknown;
    const saveSettingsResponse = await page.request.post(
      `${backendOrigin}/api/saveSettings`,
      {
        data: {
          settings: settingsDocument,
        },
      },
    );
    const saveSettingsBody = await saveSettingsResponse.text();
    expect(saveSettingsResponse.ok(), saveSettingsBody).toBe(true);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
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
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-full",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin config enum fields persist selected values", async ({ page }) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/full",
  );
  const tempPluginRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "setta-plugin-config-enum-"),
  );
  const mutablePluginRoot = path.join(tempPluginRoot, "full-plugin");
  fs.cpSync(fixturePluginRoot, mutablePluginRoot, { recursive: true });
  const schemaPath = path.join(
    mutablePluginRoot,
    "content",
    "config",
    "schema.json",
  );
  fs.writeFileSync(
    schemaPath,
    JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: "Full Fixture Plugin Config",
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          label: { type: "string" },
          mode: {
            type: "string",
            title: "Mode",
            enum: ["off", "on", "auto"],
          },
        },
        required: ["enabled"],
      },
      null,
      2,
    ),
    "utf-8",
  );

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
    await configTextarea.fill('{"enabled": true}');
    const modeSelect = pluginCard.locator("select").first();
    await modeSelect.selectOption({ label: "auto" });
    await expect
      .poll(async () => {
        const parsed = JSON.parse(await configTextarea.inputValue()) as {
          enabled?: boolean;
          mode?: string;
        };
        return {
          enabled: parsed.enabled ?? null,
          mode: parsed.mode ?? null,
        };
      })
      .toEqual({
        enabled: true,
        mode: "auto",
      });

    const saveConfigResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/plugins/config") &&
        response.request().method() === "POST",
    );
    await pluginCard
      .getByRole("button", { name: "Save Plugin Config", exact: true })
      .click();
    await saveConfigResponse;
    await expect(
      pluginCard.getByText("Plugin config saved.", { exact: true }).first(),
    ).toBeVisible();

    const configPayload = JSON.parse(await configTextarea.inputValue()) as {
      enabled?: boolean;
      mode?: string;
    };
    expect(configPayload.enabled).toBe(true);
    expect(configPayload.mode).toBe("auto");
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-full",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
    fs.rmSync(tempPluginRoot, { recursive: true, force: true });
  }
});
