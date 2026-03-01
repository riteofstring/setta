import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const KWARG_COUNT = 90;

type ParamDomMetrics = {
  topLevelRowCount: number;
  totalRowCount: number;
  sectionSubtreeElementCount: number;
  avgNodesPerRowSubtree: number;
};

test("large param DOM keeps row-structure metrics within budget", async ({
  page,
}) => {
  test.setTimeout(240000);
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createDictSection(page, context.projectConfigId);
    for (let idx = 0; idx < KWARG_COUNT; idx += 1) {
      await postBackend(page, "/addKwarg", {
        projectConfigId: context.projectConfigId,
        sectionId,
      });
    }

    await expect
      .poll(async () => {
        const metrics = await readParamDomMetrics(page, sectionId);
        return metrics.topLevelRowCount;
      })
      .toBe(KWARG_COUNT);

    const metrics = await readParamDomMetrics(page, sectionId);
    expect(metrics.topLevelRowCount).toBe(KWARG_COUNT);
    expect(metrics.totalRowCount).toBe(KWARG_COUNT);
    // Keep DOM complexity bounded per row as a stable perf proxy.
    expect(metrics.avgNodesPerRowSubtree).toBeLessThan(20);
    // Keep total section subtree bounded relative to row count.
    expect(metrics.sectionSubtreeElementCount).toBeLessThan(KWARG_COUNT * 30);
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

async function createDictSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for dict section.");
  }
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Dict",
      viewportBounds,
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing dict sectionId.");
  }
  return response.sectionId;
}

async function readParamDomMetrics(
  page: Page,
  sectionId: string,
): Promise<ParamDomMetrics> {
  return await page.evaluate((targetSectionId) => {
    const sectionNode = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${targetSectionId}"]`,
    );
    if (!sectionNode) {
      return {
        topLevelRowCount: 0,
        totalRowCount: 0,
        sectionSubtreeElementCount: 0,
        avgNodesPerRowSubtree: 0,
      };
    }

    const rowSelector = `[id^="ParamContainer-${targetSectionId}-"][data-param-row="true"]`;
    const rows = Array.from(sectionNode.querySelectorAll<HTMLElement>(rowSelector));
    const topLevelRows = rows.filter(
      (row) => !row.parentElement?.closest<HTMLElement>(rowSelector),
    );
    const sectionSubtreeElementCount = sectionNode.querySelectorAll("*").length + 1;
    const avgNodesPerRowSubtree =
      rows.length === 0
        ? 0
        : rows.reduce(
            (sum, row) => sum + row.querySelectorAll("*").length + 1,
            0,
          ) / rows.length;

    return {
      topLevelRowCount: topLevelRows.length,
      totalRowCount: rows.length,
      sectionSubtreeElementCount,
      avgNodesPerRowSubtree,
    };
  }, sectionId);
}
