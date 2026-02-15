import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

test("plugin-not-installed fallback uses canonical scope wording", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);
  try {
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
          pluginId: "missing.plugin",
          kind: "missing-kind",
          data: {
            text: "fallback wording",
          },
        },
        viewportBounds,
      },
    );
    expect(created?.sectionId).toBeTruthy();

    await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
    await expect(
      page.getByText(
        "Plugin is not installed in this workspace or setta_files scope.",
      ),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin-kind-missing fallback uses explicit section kind wording", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
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
          pluginId: "setta-fixture-frontend",
          kind: "missing-fixture-kind",
          data: {
            text: "missing kind fallback wording",
          },
        },
        viewportBounds,
      },
    );
    expect(created?.sectionId).toBeTruthy();

    await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
    await expect(
      page.getByText(
        "Plugin section kind is no longer registered by this plugin.",
      ),
    ).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin fallback reason updates reactively when plugin state changes", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
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
          pluginId: "setta-fixture-frontend",
          kind: "missing-reactive-kind",
          data: {
            text: "reactive fallback wording",
          },
        },
        viewportBounds,
      },
    );
    expect(created?.sectionId).toBeTruthy();

    await expect(
      page.getByText(
        "Plugin section kind is no longer registered by this plugin.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open Plugins", exact: true }).click();
    await expect(page.getByText("Plugin Runtime", { exact: true })).toBeVisible();
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
    await pluginCard.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(page.getByText("Disable plugin completed.")).toBeVisible();
    await expect(
      page.getByText("Plugin is installed but currently disabled."),
    ).toBeVisible();
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
