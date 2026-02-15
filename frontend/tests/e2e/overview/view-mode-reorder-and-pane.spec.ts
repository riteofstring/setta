import { expect, test, type Locator, type Page } from "@playwright/test";
import { openIsolatedProject, postBackend, seedLocalStorage } from "../helpers";

const READY_SELECTOR = ".react-flow__pane";
const OVERVIEW_VIEW_MODE_ROW_SELECTOR =
  '[data-testid="overview-view-mode-row"], [data-testid="overview-view-mode-edit-row"]';

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
  await page.mouse.move(
    targetBox.x + targetBox.width * 0.5,
    targetBox.y + targetBox.height * 0.5,
    { steps: 40 },
  );
  await page.mouse.up();
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

test("legacy ProjectConfigs overview tab opens the View Modes pane with project configs section visible", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectConfigs",
    overviewVis: true,
  });
  await openIsolatedProject(page);
  await page.waitForSelector(READY_SELECTOR);

  await expect(page.getByTestId("overview-tab-view-modes")).toBeVisible();
  await expect(
    page.getByTestId("view-modes-project-configs-toggle"),
  ).toBeVisible();
  await expect(
    page.getByTestId("view-modes-project-configs-resize-handle"),
  ).toBeVisible();
  await expect(
    page.getByTestId("view-modes-project-configs-section"),
  ).toBeVisible();
  await expect(
    page.getByTestId("overview-project-config-row").first(),
  ).toBeVisible();
  await expect(page.getByText("Toggle config previews.")).toBeVisible();
});
