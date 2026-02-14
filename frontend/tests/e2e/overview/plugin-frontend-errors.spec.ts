import { expect, test } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

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
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend-errors",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
