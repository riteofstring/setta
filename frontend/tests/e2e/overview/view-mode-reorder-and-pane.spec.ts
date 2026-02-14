import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

const READY_SELECTOR = ".react-flow__pane";
const VIEW_MODE_DRAG_MIME = "application/x-setta-view-mode-id";
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

async function dispatchNativeDragById(
  page: Page,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const didDispatch = await page.evaluate(
    ({ sourceIdArg, targetIdArg, mimeType }) => {
      const source = document.querySelector<HTMLElement>(
        `[data-view-mode-id="${sourceIdArg}"]`,
      );
      const target = document.querySelector<HTMLElement>(
        `[data-view-mode-id="${targetIdArg}"]`,
      );
      if (!source || !target) {
        return false;
      }

      const dataTransfer = new DataTransfer();
      source.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      dataTransfer.setData(mimeType, sourceIdArg);
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      source.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      return true;
    },
    {
      sourceIdArg: sourceId,
      targetIdArg: targetId,
      mimeType: VIEW_MODE_DRAG_MIME,
    },
  );

  if (!didDispatch) {
    throw new Error(`Missing drag source/target for ${sourceId} -> ${targetId}.`);
  }
}

async function dragToTarget(page: Page, source: Locator, target: Locator) {
  try {
    await source.dragTo(target);
    return;
  } catch {
    // Fall back to pointer drag for environments where dragTo does not emit
    // the exact pointer sequence the DnD sensors expect.
  }
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Missing bounding box for drag.");
  }
  await page.mouse.move(
    sourceBox.x + sourceBox.width * 0.5,
    sourceBox.y + sourceBox.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width * 0.3,
    targetBox.y + targetBox.height * 0.5,
    { steps: 12 },
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
        const truncateText = el.querySelector("span.truncate")?.textContent?.trim();
        if (truncateText) {
          return truncateText;
        }
        const inputValue = (
          el.querySelector('input[placeholder="View mode name"]') as
            | HTMLInputElement
            | null
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

  await expect(page.locator('[data-testid="view-mode-tabs-list"]')).toBeVisible();
  const tabAButton = page.locator(`[data-view-mode-id="${tabAId}"]`);
  const tabCButton = page.locator(`[data-view-mode-id="${tabCId}"]`);
  await expect(tabAButton).toBeVisible();
  await expect(tabCButton).toBeVisible();

  const before = await readTabOrder(page);
  const beforeTabA = before.indexOf("Tab A");
  const beforeTabC = before.indexOf("Tab C");
  expect(beforeTabA).toBeGreaterThanOrEqual(0);
  expect(beforeTabC).toBeGreaterThan(beforeTabA);

  await dragToTarget(page, tabCButton, tabAButton);

  const tabOrderAfterDrag = await readTabOrder(page);
  if (tabOrderAfterDrag.indexOf("Tab C") > tabOrderAfterDrag.indexOf("Tab A")) {
    await dispatchNativeDragById(page, tabCId, tabAId);
  }

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
  const heading = page.getByRole("heading", { name: "View Modes" });
  const headingVisible = await heading.isVisible().catch(() => false);
  if (!headingVisible) {
    await page.getByTestId("overview-tab-view-modes").click();
    await expect(heading).toBeVisible();
  }

  const projectConfigsButton = page.locator(
    '[data-testid="view-modes-internal-pane-button"][data-pane="projectConfigs"]',
  );
  if ((await projectConfigsButton.getAttribute("aria-pressed")) === "true") {
    await page
      .locator(
        '[data-testid="view-modes-internal-pane-button"][data-pane="viewModes"]',
      )
      .click();
  }

  await expect(page.locator(OVERVIEW_VIEW_MODE_ROW_SELECTOR).first()).toBeVisible();
  const modeARow = page.locator(`[data-view-mode-id="${modeAId}"]`).first();
  const modeCRow = page.locator(`[data-view-mode-id="${modeCId}"]`).first();
  await expect(modeARow).toBeVisible();
  await expect(modeCRow).toBeVisible();

  const beforeOrder = await readOverviewViewModeOrder(page);
  expect(beforeOrder.join(" ")).toContain("Mode A");
  expect(beforeOrder.join(" ")).toContain("Mode C");

  await dragToTarget(page, modeCRow, modeARow);

  const rowOrderAfterDrag = await readOverviewViewModeOrder(page);
  if (
    rowOrderAfterDrag.join(" ").indexOf("Mode C") >
    rowOrderAfterDrag.join(" ").indexOf("Mode A")
  ) {
    await dispatchNativeDragById(page, modeCId, modeAId);
  }

  await expect
    .poll(async () => {
      const order = await readOverviewViewModeOrder(page);
      return order.join(" ").indexOf("Mode C") < order.join(" ").indexOf("Mode A");
    })
    .toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  await expect
    .poll(async () => {
      const order = await readOverviewViewModeOrder(page);
      return order.join(" ").indexOf("Mode C") < order.join(" ").indexOf("Mode A");
    })
    .toBeTruthy();
});

test("legacy ProjectConfigs overview tab opens inside the View Modes pane", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectConfigs",
    overviewVis: true,
  });
  await openIsolatedProject(page);
  await page.waitForSelector(READY_SELECTOR);

  await expect(page.getByRole("heading", { name: "View Modes" })).toBeVisible();
  await expect(
    page.locator('[data-testid="view-modes-internal-pane-button"][data-pane="projectConfigs"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Toggle config previews.")).toBeVisible();
});
