import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl?: string }>;
    sectionImpls?: Record<string, { topLevelParamId?: string }>;
  };
};

test("nested param value edits persist across reload", async ({ page }) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createDictSection(page, context.projectConfigId);
    await addKwargs(page, context.projectConfigId, sectionId, 2);

    const topLevelIds = await getTopLevelParamIds(page, sectionId);
    expect(topLevelIds).toHaveLength(2);
    const parentParamId = topLevelIds[0];
    const nestedParamId = topLevelIds[1];

    // Build a deterministic nested tree so we can verify nested editor persistence.
    await postBackend(page, "/indentParams", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramIds: [nestedParamId],
    });
    await expect
      .poll(async () => {
        return await isNestedRow(page, sectionId, nestedParamId);
      })
      .toBe(true);

    await postBackend(page, "/setCodeObjName", {
      projectConfigId: context.projectConfigId,
      codeObjId: parentParamId,
      name: "parent",
    });
    await postBackend(page, "/setCodeObjName", {
      projectConfigId: context.projectConfigId,
      codeObjId: nestedParamId,
      name: "child",
    });

    // SwitchParam gives a deterministic clickable UI control for persistence checks.
    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId: nestedParamId,
      selectedId: "SwitchParam",
    });

    const nestedRow = page.locator(`#ParamContainer-${sectionId}-${nestedParamId}`);
    await expect(nestedRow).toBeVisible();
    const switchControl = nestedRow.locator('[role="switch"]').first();
    await expect(switchControl).toBeVisible();
    const initialChecked = await switchControl.getAttribute("aria-checked");
    if (initialChecked !== "true" && initialChecked !== "false") {
      throw new Error(`Unexpected switch checked state: ${String(initialChecked)}`);
    }
    const toggledChecked = initialChecked === "true" ? "false" : "true";
    // Use backend update for deterministic toggling in CI/headless where nested switch
    // controls can be actionability-blocked, then verify the UI reflects the new value.
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId: nestedParamId,
      value: toggledChecked,
    });
    await expect(switchControl).toHaveAttribute("aria-checked", toggledChecked);

    await postBackend(page, "/saveProject", {
      projectConfigId: context.projectConfigId,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(nestedRow).toBeVisible();

    await expect
      .poll(async () => {
        return await isNestedRow(page, sectionId, nestedParamId);
      })
      .toBe(true);
    await expect(switchControl).toHaveAttribute("aria-checked", toggledChecked);
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

test("param reordering updates top-level order and survives reload", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createDictSection(page, context.projectConfigId);
    await addKwargs(page, context.projectConfigId, sectionId, 3);

    const initialOrder = await getTopLevelParamIds(page, sectionId);
    expect(initialOrder).toHaveLength(3);
    const [firstParamId, secondParamId, thirdParamId] = initialOrder;

    await postBackend(page, "/setCodeObjName", {
      projectConfigId: context.projectConfigId,
      codeObjId: firstParamId,
      name: "alpha",
    });
    await postBackend(page, "/setCodeObjName", {
      projectConfigId: context.projectConfigId,
      codeObjId: secondParamId,
      name: "beta",
    });
    await postBackend(page, "/setCodeObjName", {
      projectConfigId: context.projectConfigId,
      codeObjId: thirdParamId,
      name: "gamma",
    });

    const rootParamId = await getRootParamId(
      page,
      context.projectConfigId,
      sectionId,
    );
    await postBackend(page, "/moveParams", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramIds: [thirdParamId],
      newParentId: rootParamId,
      newIndex: 0,
    });
    await expect
      .poll(async () => {
        return await getTopLevelParamIds(page, sectionId);
      })
      .toEqual([thirdParamId, firstParamId, secondParamId]);

    await postBackend(page, "/saveProject", {
      projectConfigId: context.projectConfigId,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect
      .poll(async () => {
        return await getTopLevelParamIds(page, sectionId);
      })
      .toEqual([thirdParamId, firstParamId, secondParamId]);
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

async function addKwargs(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  count: number,
): Promise<void> {
  for (let idx = 0; idx < count; idx += 1) {
    await postBackend(page, "/addKwarg", {
      projectConfigId,
      sectionId,
    });
  }
  await expect
    .poll(async () => {
      return (await getTopLevelParamIds(page, sectionId)).length;
    })
    .toBe(count);
}

async function getTopLevelParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate((targetSectionId) => {
    const rowSelector = `[id^="ParamContainer-${targetSectionId}-"][data-param-row="true"]`;
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(rowSelector),
    ).filter(
      (row) =>
        !row.parentElement?.closest<HTMLElement>(
          `[id^="ParamContainer-${targetSectionId}-"][data-param-row="true"]`,
        ),
    );
    const prefix = `ParamContainer-${targetSectionId}-`;
    return rows
      .map((row) => row.id)
      .filter((rowId) => rowId.startsWith(prefix))
      .map((rowId) => rowId.slice(prefix.length));
  }, sectionId);
}

async function isNestedRow(
  page: Page,
  sectionId: string,
  paramId: string,
): Promise<boolean> {
  return await page.evaluate(
    ({ targetSectionId, targetParamId }) => {
      const row = document.getElementById(
        `ParamContainer-${targetSectionId}-${targetParamId}`,
      );
      if (!row) {
        return false;
      }
      return Boolean(
        row.parentElement?.closest<HTMLElement>(
          `[id^="ParamContainer-${targetSectionId}-"][data-param-row="true"]`,
        ),
      );
    },
    { targetSectionId: sectionId, targetParamId: paramId },
  );
}

async function getRootParamId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  const latest = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const sectionVariantMap = latest?.projectState?.projectConfig?.sectionVariantMap;
  const sectionVariants = latest?.projectState?.sectionVariants ?? {};
  const sectionImpls = latest?.projectState?.sectionImpls ?? {};
  const variantId = sectionVariantMap?.[sectionId];
  if (!variantId) {
    throw new Error(`Missing variant id for section ${sectionId}.`);
  }
  const implId = sectionVariants[variantId]?.impl;
  if (!implId) {
    throw new Error(`Missing impl id for section ${sectionId}.`);
  }
  const topLevelParamId = sectionImpls[implId]?.topLevelParamId;
  if (!topLevelParamId) {
    throw new Error(`Missing top-level param id for section ${sectionId}.`);
  }
  return topLevelParamId;
}
