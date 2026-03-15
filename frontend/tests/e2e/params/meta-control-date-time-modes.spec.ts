import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl: string }>;
    sectionImpls?: Record<
      string,
      {
        type: string;
        metaControlParamId?: string | null;
        codeObjVariantMap?: Record<string, string>;
      }
    >;
  };
};

async function createMetaControlSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "MetaControl",
    },
  );
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId for MetaControl creation.");
  }
  return sectionId;
}

async function loadLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(
      page,
      "/getLatestProjectState",
      {
        projectConfigId,
      },
    )) ?? {}
  );
}

function getMetaControlParamId(
  latest: LatestProjectStateResponse,
  sectionId: string,
): string | null {
  const variantId =
    latest.projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!variantId) {
    return null;
  }
  const implId = latest.projectState?.sectionVariants?.[variantId]?.impl;
  if (!implId) {
    return null;
  }
  const impl = latest.projectState?.sectionImpls?.[implId];
  if (!impl || impl.type !== "MetaControl") {
    return null;
  }
  if (impl.metaControlParamId) {
    return impl.metaControlParamId;
  }
  const paramIds = Object.keys(impl.codeObjVariantMap ?? {});
  if (paramIds.length === 0) {
    return null;
  }
  return paramIds[0] ?? null;
}

async function waitForMetaControlParamId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  for (let idx = 0; idx < 80; idx += 1) {
    const latest = await loadLatestProjectState(page, projectConfigId);
    const paramId = getMetaControlParamId(latest, sectionId);
    if (paramId) {
      return paramId;
    }
    await page.waitForTimeout(50);
  }
  throw new Error("Timed out waiting for meta control param id.");
}

test("meta control time defaults to display and can switch to input mode", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createMetaControlSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);
    const paramInfoId = await waitForMetaControlParamId(
      page,
      context.projectConfigId,
      sectionId,
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: "TimeParam",
    });

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "display",
        timeDisplayFormat: "twelve_hour",
      },
    });
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      value: "13:45",
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    await expect(sectionNode.getByText("1:45 PM")).toBeVisible();
    await expect(sectionNode.locator('input[type="time"]')).toHaveCount(0);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "input",
        timeDisplayFormat: "twelve_hour",
      },
    });

    const timeInput = sectionNode.locator('input[type="time"]');
    await expect(timeInput).toBeVisible();
    await expect(timeInput).toHaveValue("13:45");

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "display",
        timeDisplayFormat: "twelve_hour",
      },
    });
    await expect(sectionNode.getByText("1:45 PM")).toBeVisible();
    await expect(sectionNode.locator('input[type="time"]')).toHaveCount(0);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "input",
        timeDisplayFormat: "twelve_hour",
      },
    });
    await expect(timeInput).toBeVisible();
    await expect(timeInput).toHaveValue("13:45");
  } finally {
    if (sectionIds.length > 0) {
      await postBackend(page, "/deleteSections", {
        projectConfigId: context.projectConfigId,
        sectionIds,
      });
    }
    await cleanupIsolatedProject(page, context);
  }
});

test("meta control calendar renders calendar UI", async ({ page }) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createMetaControlSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);
    const paramInfoId = await waitForMetaControlParamId(
      page,
      context.projectConfigId,
      sectionId,
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: "DateParam",
    });

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: "calendar",
        dateSelectionMode: "multiple",
        dateCalendarWeekStart: "monday",
      },
    });
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      value: '["2026-02-01","2026-02-03"]',
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    await expect(
      sectionNode.getByRole("button", { name: "Prev", exact: true }),
    ).toBeVisible();
    await expect(
      sectionNode.getByRole("button", { name: "Next", exact: true }),
    ).toBeVisible();
    await expect(sectionNode.getByText("2 selected")).toBeVisible();
    await expect(sectionNode.locator('input[type="date"]')).toHaveCount(0);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: "input",
        dateSelectionMode: "single",
        dateCalendarWeekStart: "monday",
      },
    });
    await expect(sectionNode.locator('input[type="text"]')).toBeVisible();
    await expect(
      sectionNode.getByRole("button", { name: "Prev", exact: true }),
    ).toHaveCount(0);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: "calendar",
        dateSelectionMode: "multiple",
        dateCalendarWeekStart: "monday",
      },
    });
    await expect(
      sectionNode.getByRole("button", { name: "Prev", exact: true }),
    ).toBeVisible();
  } finally {
    if (sectionIds.length > 0) {
      await postBackend(page, "/deleteSections", {
        projectConfigId: context.projectConfigId,
        sectionIds,
      });
    }
    await cleanupIsolatedProject(page, context);
  }
});
