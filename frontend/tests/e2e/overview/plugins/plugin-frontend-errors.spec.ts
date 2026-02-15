import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

test("frontend-error fixture surfaces runtime error diagnostics and section fallback", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-errors",
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

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "setta-fixture-frontend-errors@0.1.0",
          exact: true,
        }),
      })
      .first();

    await expect(pluginCard).toBeVisible();
    await expect(
      pluginCard.getByText("Frontend load failed", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pluginCard.getByText("PLUGIN_FRONTEND_REGISTRATION_INVALID", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pluginCard.getByText(/duplicate pane duplicate-pane/i),
    ).toBeVisible();

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for plugin section.");
    }

    const created = await postBackend<CreateTopLevelSectionResponse>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId: projectContext.projectConfigId,
        implType: "Plugin",
        implOverrides: {
          type: "Plugin",
          pluginId: "setta-fixture-frontend-errors",
          kind: "fixture-unavailable",
          data: {
            text: "expect fallback",
          },
        },
        viewportBounds,
      },
    );
    expect(created?.sectionId).toBeTruthy();

    await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
    await expect(
      page.getByText(
        "Plugin capability is blocked in the current server mode.",
      ),
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

test("plugin fallback card actions open plugins, copy JSON, and delete section", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-errors",
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

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for plugin section.");
    }

    const created = await postBackend<CreateTopLevelSectionResponse>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId: projectContext.projectConfigId,
        implType: "Plugin",
        implOverrides: {
          type: "Plugin",
          pluginId: "setta-fixture-frontend-errors",
          kind: "fixture-unavailable",
          data: {
            text: "fallback actions",
          },
        },
        viewportBounds,
      },
    );
    expect(created?.sectionId).toBeTruthy();

    await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();

    await page
      .getByRole("button", { name: "Open Plugins", exact: true })
      .first()
      .click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = localStorage.getItem("setta_data");
            if (!raw) {
              return null;
            }
            const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
            const state = parsed.state ?? {};
            return {
              overviewTab:
                typeof state.overviewTab === "string" ? state.overviewTab : null,
            };
          }),
        { timeout: 10000 },
      )
      .toEqual({ overviewTab: "Plugins" });

    await page
      .getByRole("button", { name: "Copy Section JSON", exact: true })
      .first()
      .click();
    await expect(
      page
        .getByText("Copied plugin section JSON.")
        .or(page.getByText("Failed to copy plugin section JSON.")),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Delete Section", exact: true })
      .first()
      .click();
    await expect(page.getByText("Plugin section deleted.")).toBeVisible();
    await expect(page.getByText("Plugin Section Unavailable")).toHaveCount(0);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-errors",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin frontend registration rejects full project-state selector reads", async ({
  page,
}) => {
  const baseFixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "setta-plugin-full-selector-"),
  );
  const fixturePluginRoot = path.join(tempRoot, "plugin");
  await fs.cp(baseFixturePluginRoot, fixturePluginRoot, { recursive: true });
  const manifestPath = path.join(fixturePluginRoot, "setta.plugin.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
    id: string;
    name: string;
  };
  const pluginId = `setta-fixture-frontend-full-selector-${randomUUID().slice(0, 8)}`;
  manifest.id = pluginId;
  manifest.name = "Setta Fixture Frontend Full Selector";
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  await fs.writeFile(
    path.join(fixturePluginRoot, "frontend", "dist", "index.js"),
    [
      "export const apiVersion = 1;",
      "",
      "export function register(host) {",
      "  host.readProjectState({ kind: 'full' });",
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
    await page.waitForSelector(".react-flow__pane");

    const pluginCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: new RegExp(`^${pluginId}@0\\.1\\.0$`),
        }),
      })
      .first();

    await expect(pluginCard).toBeVisible();
    await expect(pluginCard.getByText("Frontend load failed")).toBeVisible();
    await expect(
      pluginCard.getByText("PLUGIN_FRONTEND_REGISTRATION_INVALID"),
    ).toBeVisible();
    await expect(
      pluginCard.getByText(/project state selector kind full is unsupported/i),
    ).toBeVisible();
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
