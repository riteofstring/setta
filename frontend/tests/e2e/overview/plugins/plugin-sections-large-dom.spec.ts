import { expect, test, type Page } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  refreshProjectStateFromBackend,
  setOverviewTab,
} from "../../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type FixtureRenderMetrics = {
  perCreatedSectionCounts: number[];
  totalRendersForCreatedSections: number;
  uniqueCreatedSectionsRendered: number;
  maxRendersForAnySection: number;
};

async function readFixtureRenderMetrics(
  page: Page,
  sectionIds: string[],
): Promise<FixtureRenderMetrics> {
  return await page.evaluate((ids: string[]) => {
    const scope = window as {
      __settaFixtureRenderBySectionId?: Record<string, number>;
    };
    const bySection = scope.__settaFixtureRenderBySectionId ?? {};
    const perCreatedSectionCounts = ids.map((sectionId) =>
      Number(bySection[sectionId] || 0),
    );
    return {
      perCreatedSectionCounts,
      totalRendersForCreatedSections: perCreatedSectionCounts.reduce(
        (sum, count) => sum + count,
        0,
      ),
      uniqueCreatedSectionsRendered: perCreatedSectionCounts.filter(
        (count) => count > 0,
      ).length,
      maxRendersForAnySection:
        perCreatedSectionCounts.length > 0 ? Math.max(...perCreatedSectionCounts) : 0,
    };
  }, sectionIds);
}

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
    await page.evaluate(() => {
      const scope = window as {
        __settaFixtureRenderCount?: number;
        __settaFixtureRenderBySectionId?: Record<string, number>;
      };
      scope.__settaFixtureRenderCount = 0;
      scope.__settaFixtureRenderBySectionId = {};
    });

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for plugin section placement.");
    }

    const totalSections = 110;
    const columns = 11;
    const rows = 10;
    const createdSectionIds: string[] = [];
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
      const sectionId = created?.sectionId;
      expect(sectionId).toBeTruthy();
      if (!sectionId) {
        throw new Error("Missing created fixture section id.");
      }
      createdSectionIds.push(sectionId);
    }
    await refreshProjectStateFromBackend(page, projectContext.projectConfigId);

    await expect
      .poll(
        async () => {
          return await page.locator("[data-testid='fixture-plugin-card']").count();
        },
        { timeout: 20000 },
      )
      .toBeGreaterThan(80);

    const baselineRenderMetrics = await readFixtureRenderMetrics(
      page,
      createdSectionIds,
    );
    expect(baselineRenderMetrics.uniqueCreatedSectionsRendered).toBeGreaterThan(80);
    expect(baselineRenderMetrics.totalRendersForCreatedSections).toBeLessThan(
      totalSections * 60,
    );
    expect(baselineRenderMetrics.maxRendersForAnySection).toBeLessThan(120);

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

    const postCommandRenderMetrics = await readFixtureRenderMetrics(
      page,
      createdSectionIds,
    );
    const additionalRendersBySection =
      postCommandRenderMetrics.perCreatedSectionCounts.map((count, index) =>
        Math.max(0, count - baselineRenderMetrics.perCreatedSectionCounts[index]),
      );
    const totalAdditionalRenders = additionalRendersBySection.reduce(
      (sum, count) => sum + count,
      0,
    );
    const maxAdditionalRendersForAnySection =
      additionalRendersBySection.length > 0
        ? Math.max(...additionalRendersBySection)
        : 0;
    expect(totalAdditionalRenders).toBeLessThan(totalSections * 25);
    expect(maxAdditionalRendersForAnySection).toBeLessThan(40);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
