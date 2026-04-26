import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../../helpers";

const READY_SELECTOR = ".canvas-flow__canvas";
const OVERVIEW_VIEW_MODE_ROW_SELECTOR =
  '[data-testid="overview-view-mode-row"], [data-testid="overview-view-mode-edit-row"]';
const OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR =
  '[data-testid="overview-project-config-row"]';

type ProjectMetadataResponse = {
  defaultProjectConfigId?: string | null;
  projectMetadata: Array<{ id: string; name: string }>;
};
type LoadProjectConfigWithViewModes = {
  projectConfig?: {
    activeViewModeId?: string | null;
    viewModes?: Record<
      string,
      { id: string; name?: string | null; sortIndex?: number | null }
    >;
  };
};

async function createNamedViewMode(
  page: Page,
  projectConfigId: string,
  name: string,
  isTab: boolean,
): Promise<string> {
  const viewModeId = await postBackend<string>(page, "/createViewMode", {
    projectConfigId,
  });
  if (!viewModeId) {
    throw new Error("Missing viewModeId from /createViewMode.");
  }
  await postBackend(page, "/setViewModeName", {
    projectConfigId,
    viewModeId,
    name,
  });
  if (isTab) {
    await postBackend(page, "/toggleViewModeTab", {
      projectConfigId,
      viewModeId,
    });
  }
  return viewModeId;
}

async function dragToTarget(page: Page, source: Locator, target: Locator) {
  return dragToTargetWithPosition(page, source, target, "center");
}

async function dragToTargetWithPosition(
  page: Page,
  source: Locator,
  target: Locator,
  position: "center" | "before",
) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Missing drag source or target bounds.");
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width * 0.5,
    sourceBox.y + sourceBox.height * 0.5,
  );
  await page.mouse.down();
  const dropX = targetBox.x + targetBox.width * 0.5;
  const dropY =
    position === "before"
      ? targetBox.y + Math.max(2, targetBox.height * 0.15)
      : targetBox.y + targetBox.height * 0.5;
  await page.mouse.move(dropX, dropY, { steps: 40 });
  await page.mouse.up();
}

async function dragToTargetUntil(
  page: Page,
  source: Locator,
  target: Locator,
  hasReordered: () => Promise<boolean>,
  position: "center" | "before" = "center",
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await dragToTargetWithPosition(page, source, target, position);
    if (await hasReordered()) {
      return;
    }
    await page.waitForTimeout(100);
  }
}

async function readTabOrder(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="view-mode-tab-button"]')
    .evaluateAll((elements) =>
      elements.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
}

async function readOverviewViewModeOrder(page: Page): Promise<string[]> {
  return page.locator(OVERVIEW_VIEW_MODE_ROW_SELECTOR).evaluateAll((elements) =>
    elements
      .map((el) => {
        const truncateText = el
          .querySelector("span.truncate")
          ?.textContent?.trim();
        if (truncateText) {
          return truncateText;
        }
        const inputValue = (
          el.querySelector(
            'input[placeholder="View mode name"]',
          ) as HTMLInputElement | null
        )?.value?.trim();
        if (inputValue) {
          return inputValue;
        }
        return (el.textContent ?? "").replace(/\s+/g, " ").trim();
      })
      .filter((label) => label.length > 0),
  );
}

type IncompatibleProjectConfigSummary = {
  id: string;
  name: string;
};

async function findIncompatibleOverviewProjectConfig(
  page: Page,
): Promise<IncompatibleProjectConfigSummary> {
  let incompatible: IncompatibleProjectConfigSummary | null = null;
  await expect
    .poll(
      async () => {
        incompatible = await page.evaluate(async () => {
          const { useAllProjectMetadata, useProjectState } = await import(
            "/src/state/definitions.ts"
          );
          const currentState = useProjectState.getState();
          const currentSectionIds = Object.keys(
            currentState.projectConfig.sectionVariantMap ?? {},
          );
          if (currentSectionIds.length === 0) {
            return null;
          }
          const currentSectionIdSet = new Set(currentSectionIds);
          for (const config of useAllProjectMetadata.getState()
            .projectMetadata) {
            if (config.id === currentState.projectConfig.id) {
              continue;
            }
            const candidateSectionIds = Object.keys(
              config.sectionVariantMap ?? {},
            );
            if (candidateSectionIds.length !== currentSectionIds.length) {
              return { id: config.id, name: config.name };
            }
            let isCompatible = true;
            for (const sectionId of candidateSectionIds) {
              if (!currentSectionIdSet.has(sectionId)) {
                isCompatible = false;
                break;
              }
            }
            if (!isCompatible) {
              return { id: config.id, name: config.name };
            }
          }
          return null;
        });
        return incompatible?.id ?? null;
      },
      {
        timeout: 5000,
      },
    )
    .not.toBeNull();
  if (!incompatible) {
    throw new Error("Expected an incompatible project config row to exist.");
  }
  return incompatible;
}

async function readPersistedViewModeOrderById(page: Page): Promise<string[]> {
  const payload = (await loadProjectConfig(
    page,
  )) as LoadProjectConfigWithViewModes;
  const viewModes = Object.values(payload.projectConfig?.viewModes ?? {});
  return viewModes
    .sort((left, right) => (left.sortIndex ?? 0) - (right.sortIndex ?? 0))
    .map((mode) => mode.id);
}

async function createProjectConfigAndResolveId(
  page: Page,
  previewImgColor: string,
): Promise<{ id: string; name: string }> {
  const createdName = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor,
  });
  if (!createdName) {
    throw new Error("Missing project config name from /createProjectConfig.");
  }
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  const match = metadata?.projectMetadata.find(
    (entry) => entry.name === createdName,
  );
  if (!match) {
    throw new Error(`Unable to resolve project config id for ${createdName}.`);
  }
  return { id: match.id, name: match.name };
}

async function trimProjectConfigsTo(
  page: Page,
  keepProjectConfigIds: string[],
): Promise<void> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  const keepIds = new Set(keepProjectConfigIds);
  if (metadata?.defaultProjectConfigId) {
    keepIds.add(metadata.defaultProjectConfigId);
  }
  const idsToDelete =
    metadata?.projectMetadata
      .map((entry) => entry.id)
      .filter((id) => !keepIds.has(id)) ?? [];
  if (idsToDelete.length === 0) {
    return;
  }
  await postBackend(page, "/deleteProjectConfigs", { ids: idsToDelete });
}

async function readOverviewProjectConfigOrderById(
  page: Page,
): Promise<string[]> {
  return page
    .locator(OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR)
    .evaluateAll((rows) =>
      rows
        .map((row) => row.getAttribute("data-project-config-id") ?? "")
        .filter((id) => id.length > 0),
    );
}

async function readPersistedOverviewProjectConfigOrder(
  page: Page,
): Promise<string[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("setta_data");
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as {
      state?: { overviewProjectConfigOrder?: unknown };
    };
    const order = parsed.state?.overviewProjectConfigOrder;
    if (!Array.isArray(order)) {
      return [];
    }
    return order.filter((id): id is string => typeof id === "string");
  });
}

test("tab drag reorder persists across reload", async ({ page }) => {
  const context = await openIsolatedProject(page);
  const tabAId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Tab A",
    true,
  );
  await createNamedViewMode(page, context.projectConfigId, "Tab B", true);
  const tabCId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Tab C",
    true,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  await expect(
    page.locator('[data-testid="view-mode-tabs-list"]'),
  ).toBeVisible();
  const tabAButton = page.locator(
    `[data-testid="view-mode-tab-button"][data-view-mode-id="${tabAId}"]`,
  );
  const tabCButton = page.locator(
    `[data-testid="view-mode-tab-button"][data-view-mode-id="${tabCId}"]`,
  );
  const tabCHandle = tabCButton.getByTestId("view-mode-tab-drag-handle");
  await expect(tabAButton).toBeVisible();
  await expect(tabCButton).toBeVisible();
  await expect(tabCHandle).toBeVisible();
  await expect(tabCHandle).toHaveAttribute(
    "aria-label",
    "Reorder view mode tab",
  );
  await expect(tabCHandle.locator("svg")).toBeVisible();

  const before = await readTabOrder(page);
  const beforeTabA = before.indexOf("Tab A");
  const beforeTabC = before.indexOf("Tab C");
  expect(beforeTabA).toBeGreaterThanOrEqual(0);
  expect(beforeTabC).toBeGreaterThan(beforeTabA);

  await dragToTarget(page, tabCHandle, tabAButton);

  await expect
    .poll(async () => {
      const order = await readTabOrder(page);
      return order.indexOf("Tab C") < order.indexOf("Tab A");
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const order = await readPersistedViewModeOrderById(page);
      return order.indexOf(tabCId) < order.indexOf(tabAId);
    })
    .toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  await expect
    .poll(async () => {
      const order = await readTabOrder(page);
      return order.indexOf("Tab C") < order.indexOf("Tab A");
    })
    .toBeTruthy();
});

test("view mode pane drag reorder persists across reload", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "ViewModes", overviewVis: true });
  const context = await openIsolatedProject(page);
  const modeAId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Mode A",
    false,
  );
  await createNamedViewMode(page, context.projectConfigId, "Mode B", false);
  const modeCId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Mode C",
    false,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const viewModeRows = page.locator(OVERVIEW_VIEW_MODE_ROW_SELECTOR);
  const hasRowsVisible = await viewModeRows
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasRowsVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
  }

  await expect(viewModeRows.first()).toBeVisible();
  const modeARow = page
    .locator(
      `[data-testid="overview-view-mode-row"][data-view-mode-id="${modeAId}"], [data-testid="overview-view-mode-edit-row"][data-view-mode-id="${modeAId}"]`,
    )
    .first();
  const modeCRow = page
    .locator(
      `[data-testid="overview-view-mode-row"][data-view-mode-id="${modeCId}"], [data-testid="overview-view-mode-edit-row"][data-view-mode-id="${modeCId}"]`,
    )
    .first();
  const modeCHandle = modeCRow
    .locator(
      `[data-testid="overview-view-mode-drag-handle"], [data-testid="overview-view-mode-edit-drag-handle"]`,
    )
    .first();
  await expect(modeARow).toBeVisible();
  await expect(modeCRow).toBeVisible();
  await expect(modeCHandle).toBeVisible();

  const beforeOrder = await readOverviewViewModeOrder(page);
  expect(beforeOrder.join(" ")).toContain("Mode A");
  expect(beforeOrder.join(" ")).toContain("Mode C");

  await dragToTarget(page, modeCHandle, modeARow);

  await expect
    .poll(async () => {
      const order = await readOverviewViewModeOrder(page);
      return (
        order.join(" ").indexOf("Mode C") < order.join(" ").indexOf("Mode A")
      );
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const order = await readPersistedViewModeOrderById(page);
      return order.indexOf(modeCId) < order.indexOf(modeAId);
    })
    .toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  await expect
    .poll(async () => {
      const order = await readOverviewViewModeOrder(page);
      return (
        order.join(" ").indexOf("Mode C") < order.join(" ").indexOf("Mode A")
      );
    })
    .toBeTruthy();
});

test("deleting the active view mode falls back to first mode in sorted order", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "ViewModes", overviewVis: true });
  const context = await openIsolatedProject(page);
  const modeAId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Mode A",
    false,
  );
  const modeBId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Mode B",
    false,
  );

  const payload = (await loadProjectConfig(
    page,
  )) as LoadProjectConfigWithViewModes;
  const baseViewModeId = Object.keys(
    payload.projectConfig?.viewModes ?? {},
  ).find((viewModeId) => viewModeId !== modeAId && viewModeId !== modeBId);
  if (!baseViewModeId) {
    throw new Error("Expected base active view mode id.");
  }

  await postBackend(page, "/setViewModeSortOrder", {
    projectConfigId: context.projectConfigId,
    orderedViewModeIds: [modeAId, modeBId, baseViewModeId],
  });
  await postBackend(page, "/setActiveViewMode", {
    projectConfigId: context.projectConfigId,
    activeViewModeId: modeBId,
  });
  await postBackend(page, "/deleteViewMode", {
    projectConfigId: context.projectConfigId,
    viewModeId: modeBId,
  });

  await expect
    .poll(async () => {
      const updated = (await loadProjectConfig(
        page,
      )) as LoadProjectConfigWithViewModes;
      return updated.projectConfig?.activeViewModeId ?? null;
    })
    .toBe(modeAId);
});

test("clicking a view mode drag handle does not reorder items", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "ViewModes", overviewVis: true });
  const context = await openIsolatedProject(page);
  const modeAId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Mode A",
    false,
  );
  const modeBId = await createNamedViewMode(
    page,
    context.projectConfigId,
    "Mode B",
    false,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const viewModeRows = page.locator(OVERVIEW_VIEW_MODE_ROW_SELECTOR);
  const hasRowsVisible = await viewModeRows
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasRowsVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
  }

  const modeARow = page
    .locator(
      `[data-testid="overview-view-mode-row"][data-view-mode-id="${modeAId}"], [data-testid="overview-view-mode-edit-row"][data-view-mode-id="${modeAId}"]`,
    )
    .first();
  const modeBRow = page
    .locator(
      `[data-testid="overview-view-mode-row"][data-view-mode-id="${modeBId}"], [data-testid="overview-view-mode-edit-row"][data-view-mode-id="${modeBId}"]`,
    )
    .first();
  const modeBHandle = modeBRow
    .locator(
      `[data-testid="overview-view-mode-drag-handle"], [data-testid="overview-view-mode-edit-drag-handle"]`,
    )
    .first();

  await expect(modeARow).toBeVisible();
  await expect(modeBRow).toBeVisible();
  await expect(modeBHandle).toBeVisible();

  const beforeOrder = await readOverviewViewModeOrder(page);
  await modeBHandle.click();
  await expect(modeBRow).toBeVisible();

  await expect.poll(() => readOverviewViewModeOrder(page)).toEqual(beforeOrder);
});

test("project config drag reorder persists across reload", async ({ page }) => {
  await seedLocalStorage(page, {
    overviewTab: "ViewModes",
    overviewVis: true,
  });
  const context = await openIsolatedProject(page);
  const secondaryConfig = await createProjectConfigAndResolveId(
    page,
    "bg-emerald-500/60",
  );
  await trimProjectConfigsTo(page, [
    context.projectConfigId,
    secondaryConfig.id,
  ]);

  const projectConfigRows = page.locator(OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR);
  const hasRowsVisible = await projectConfigRows
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasRowsVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
  }

  const primaryRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${context.projectConfigId}"]`,
    )
    .first();
  const secondaryRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${secondaryConfig.id}"]`,
    )
    .first();
  const secondaryHandle = secondaryRow
    .getByTestId("overview-project-config-drag-handle")
    .first();

  await expect(primaryRow).toBeVisible();
  await expect(secondaryRow).toBeVisible();
  await expect(secondaryHandle).toBeVisible();

  const beforeOrder = await readOverviewProjectConfigOrderById(page);
  expect(beforeOrder.indexOf(context.projectConfigId)).toBeGreaterThanOrEqual(
    0,
  );
  expect(beforeOrder.indexOf(secondaryConfig.id)).toBeGreaterThanOrEqual(0);

  await dragToTargetUntil(
    page,
    secondaryHandle,
    primaryRow,
    async () => {
      const order = await readOverviewProjectConfigOrderById(page);
      return (
        order.indexOf(secondaryConfig.id) <
        order.indexOf(context.projectConfigId)
      );
    },
    "before",
  );

  await expect
    .poll(async () => {
      const order = await readOverviewProjectConfigOrderById(page);
      return (
        order.indexOf(secondaryConfig.id) <
        order.indexOf(context.projectConfigId)
      );
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const order = await readPersistedOverviewProjectConfigOrder(page);
      return (
        order.indexOf(secondaryConfig.id) <
        order.indexOf(context.projectConfigId)
      );
    })
    .toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  await expect
    .poll(async () => {
      const order = await readPersistedOverviewProjectConfigOrder(page);
      return (
        order.indexOf(secondaryConfig.id) <
        order.indexOf(context.projectConfigId)
      );
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const order = await readOverviewProjectConfigOrderById(page);
      return (
        order.includes(secondaryConfig.id) &&
        order.includes(context.projectConfigId)
      );
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const order = await readOverviewProjectConfigOrderById(page);
      return (
        order.indexOf(secondaryConfig.id) <
        order.indexOf(context.projectConfigId)
      );
    })
    .toBeTruthy();
});

test("clicking a project config drag handle does not open that config", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ViewModes",
    overviewVis: true,
  });
  await openIsolatedProject(page);
  const secondaryConfig = await createProjectConfigAndResolveId(
    page,
    "bg-amber-500/60",
  );

  const projectConfigRows = page.locator(OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR);
  const hasRowsVisible = await projectConfigRows
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasRowsVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
  }

  const secondaryRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${secondaryConfig.id}"]`,
    )
    .first();
  const secondaryHandle = secondaryRow
    .getByTestId("overview-project-config-drag-handle")
    .first();
  await expect(secondaryRow).toBeVisible();
  await expect(secondaryHandle).toBeVisible();

  const beforeOrder = await readOverviewProjectConfigOrderById(page);
  const initialPathname = new URL(page.url()).pathname;

  await secondaryHandle.click();

  await expect.poll(() => new URL(page.url()).pathname).toBe(initialPathname);
  await expect
    .poll(() => readOverviewProjectConfigOrderById(page))
    .toEqual(beforeOrder);
});

test("project config delete button keyboard action does not bubble and open config", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ViewModes",
    overviewVis: true,
  });
  await openIsolatedProject(page);
  const secondaryConfig = await createProjectConfigAndResolveId(
    page,
    "bg-lime-500/60",
  );

  const projectConfigRows = page.locator(OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR);
  const hasRowsVisible = await projectConfigRows
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasRowsVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
  }

  const projectConfigsSection = page.getByTestId(
    "view-modes-project-configs-section",
  );
  const editButton = projectConfigsSection.getByRole("button", {
    name: "Edit",
  });
  await expect(editButton).toBeVisible();
  await editButton.click();

  const secondaryRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${secondaryConfig.id}"]`,
    )
    .first();
  await expect(secondaryRow).toBeVisible();

  const deleteButton = secondaryRow.getByRole("button", {
    name: "Delete project config",
  });
  await expect(deleteButton).toBeVisible();

  const initialPathname = new URL(page.url()).pathname;
  await deleteButton.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => new URL(page.url()).pathname).toBe(initialPathname);
  await expect(page.getByText("Confirm Project Deletion")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Confirm Project Deletion")).toHaveCount(0);
});

test("project config reorder is disabled in read-only mode", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ViewModes",
    overviewVis: true,
  });
  const context = await openIsolatedProject(page);
  const secondaryConfig = await createProjectConfigAndResolveId(
    page,
    "bg-cyan-500/60",
  );

  await page.evaluate(async () => {
    const { useShareSession } = await import("/src/state/definitions.ts");
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });
  });

  const projectConfigRows = page.locator(OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR);
  const hasRowsVisible = await projectConfigRows
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasRowsVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
  }

  const editButton = page
    .getByTestId("view-modes-project-configs-section")
    .getByRole("button", { name: "Edit" });
  await expect(editButton).toBeDisabled();

  const primaryRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${context.projectConfigId}"]`,
    )
    .first();
  const secondaryRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${secondaryConfig.id}"]`,
    )
    .first();
  const secondaryHandle = secondaryRow
    .getByTestId("overview-project-config-drag-handle")
    .first();

  await expect(primaryRow).toBeVisible();
  await expect(secondaryRow).toBeVisible();
  await expect(secondaryHandle).toBeVisible();
  await expect(secondaryHandle).toHaveClass(/text-transparent/);
  await expect(secondaryHandle).not.toHaveClass(/cursor-grab/);

  const beforeOrder = await readOverviewProjectConfigOrderById(page);
  await dragToTarget(page, secondaryHandle, primaryRow);
  await expect
    .poll(() => readOverviewProjectConfigOrderById(page))
    .toEqual(beforeOrder);
});

test("hovering an incompatible project config does not crash the view-modes pane", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByTestId("overview-tab-view-modes").click();

  const projectConfigRows = page.locator(OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR);
  await expect(projectConfigRows.first()).toBeVisible();

  const incompatibleConfig = await findIncompatibleOverviewProjectConfig(page);
  const incompatibleRow = page
    .locator(
      `${OVERVIEW_PROJECT_CONFIG_ROW_SELECTOR}[data-project-config-id="${incompatibleConfig.id}"]`,
    )
    .first();
  await expect(incompatibleRow).toBeVisible();

  await incompatibleRow.hover();

  await expect(page.getByText("Unhandled Thrown Error!")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useProjectState } = await import("/src/state/definitions.ts");
        return Object.keys(useProjectState.getState().previewSectionVariantMap);
      }),
    )
    .toEqual([]);
});

test("invalid persisted overview tab falls back to the Overview pane", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "InvalidOverviewTabValue",
    overviewVis: true,
  });
  await openIsolatedProject(page);
  await page.waitForSelector(READY_SELECTOR);

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("overview-tab-overview")).toHaveClass(
    /text-blue-500/,
  );
});
