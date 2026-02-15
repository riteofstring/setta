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

test("plugin sections remain interactive with 100+ fixture sections", async ({
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
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for plugin section placement.");
    }

    const totalSections = 110;
    const columns = 11;
    const rows = 10;
    for (let index = 0; index < totalSections; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns) % rows;
      const created = await postBackend<CreateTopLevelSectionResponse>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: projectContext.projectConfigId,
          implType: "Plugin",
          controlCodeObjType: null,
          implOverrides: {
            type: "Plugin",
            pluginId: "setta-fixture-frontend",
            kind: "fixture-card",
            data: {
              text: `large-${index}`,
            },
          },
          position: {
            x: viewportBounds.x + ((column + 0.5) * viewportBounds.w) / columns,
            y: viewportBounds.y + ((row + 0.5) * viewportBounds.h) / rows,
          },
          topLevelSections: null,
          viewportBounds,
        },
      );
      expect(created?.sectionId).toBeTruthy();
    }

    await expect
      .poll(
        async () => {
          return await page.locator("[data-testid='fixture-plugin-card']").count();
        },
        { timeout: 20000 },
      )
      .toBeGreaterThan(80);

    const renderMetrics = await page.evaluate(() => {
      const scope = window as {
        __settaFixtureRenderCount?: number;
        __settaFixtureRenderBySectionId?: Record<string, number>;
      };
      const bySection = scope.__settaFixtureRenderBySectionId ?? {};
      const perSectionCounts = Object.values(bySection).map((count) =>
        Number(count || 0),
      );
      return {
        totalRenders: Number(scope.__settaFixtureRenderCount || 0),
        uniqueSectionsRendered: Object.keys(bySection).length,
        maxRendersForAnySection:
          perSectionCounts.length > 0 ? Math.max(...perSectionCounts) : 0,
      };
    });
    expect(renderMetrics.uniqueSectionsRendered).toBeGreaterThan(80);
    expect(renderMetrics.totalRenders).toBeLessThan(totalSections * 20);
    expect(renderMetrics.maxRendersForAnySection).toBeLessThan(20);

    const commandButton = page.getByRole("button", {
      name: "Fixture Command",
      exact: true,
    });
    await expect(commandButton).toBeVisible();
    await commandButton.click();

    const commandRunCount = await page.evaluate(() => {
      return Number(
        (window as { __settaFixtureCommandRuns?: number })
          .__settaFixtureCommandRuns || 0,
      );
    });
    expect(commandRunCount).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          return await page.evaluate(() => {
            return String(
              (window as { __settaFixtureLastCommandSummary?: string })
                .__settaFixtureLastCommandSummary || "",
            );
          });
        },
        { timeout: 15000 },
      )
      .toContain("backend list:200 status:200");
  } finally {
    await postBackend(page, "/plugins/unlink", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
