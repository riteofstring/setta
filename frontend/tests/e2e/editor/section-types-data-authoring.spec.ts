import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import * as XLSX from "xlsx";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
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
        codeObjVariantMap?: Record<string, string>;
        allowUnquotedStringArgs?: boolean;
        defaultChildSectionType?: string;
        viewMode?: string;
        readOnly?: boolean;
        showRowNumbers?: boolean;
        density?: string;
        autoReloadOnExternalChange?: boolean;
      }
    >;
    parentSectionMap?: Record<string, string | null>;
  };
};

type FileBrowserRootResponse = {
  rootPath: string;
};

type FileBrowserFileContentResponse = {
  contentBase64: string;
};

async function getLatestProjectState(
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

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const res = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
    },
  );
  const sectionId = res?.sectionId;
  if (!sectionId) {
    throw new Error(`Failed to create ${implType} section.`);
  }
  return sectionId;
}

async function dragBrowserRowToTarget(
  source: Locator,
  target: Locator,
): Promise<void> {
  const page = source.page();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
}

async function getViewportScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    if (!viewport) {
      return 1;
    }
    const transform = window.getComputedStyle(viewport).transform;
    if (!transform || transform === "none") {
      return 1;
    }
    const matrix = new DOMMatrixReadOnly(transform);
    if (!Number.isFinite(matrix.a) || matrix.a <= 0) {
      return 1;
    }
    return matrix.a;
  });
}

async function applyZoomPreset(
  page: Page,
  zoomOutClicks: number,
  zoomInClicks: number,
): Promise<number> {
  const resetZoomButton = page.getByRole("button", { name: "reset zoom" });
  const zoomOutButton = page.getByRole("button", { name: "zoom out" });
  const zoomInButton = page.getByRole("button", { name: "zoom in" });

  await resetZoomButton.click();
  await expect
    .poll(async () => await getViewportScale(page))
    .toBeGreaterThan(0);

  for (let i = 0; i < zoomOutClicks; i += 1) {
    await zoomOutButton.click();
  }
  for (let i = 0; i < zoomInClicks; i += 1) {
    await zoomInButton.click();
  }
  await expect
    .poll(async () => await getViewportScale(page))
    .toBeGreaterThan(0);
  return getViewportScale(page);
}

function getExpectedSpreadsheetDensityMultiplier(viewportZoom: number): number {
  const safeZoom = viewportZoom > 0 ? viewportZoom : 1;
  const desiredMultiplier =
    safeZoom >= 1 ? safeZoom : 1 / Math.max(0.01, safeZoom);
  return Math.min(6, Math.max(1, desiredMultiplier));
}

type SpreadsheetCanvasDensityMetrics = {
  densityX: number;
  densityY: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  baseFontPx: number;
};

async function getSpreadsheetCanvasDensityMetrics(
  spreadsheetNode: Locator,
): Promise<SpreadsheetCanvasDensityMetrics> {
  const metrics = await spreadsheetNode.evaluate((node) => {
    const grid = node.querySelector('[data-testid="spreadsheet-glide-grid"]');
    if (!(grid instanceof HTMLElement)) {
      return null;
    }
    const canvases = Array.from(grid.querySelectorAll("canvas"));
    if (canvases.length === 0) {
      return null;
    }
    const largest = canvases.reduce((best, current) => {
      const currentRect = current.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      if (
        currentRect.width * currentRect.height >
        bestRect.width * bestRect.height
      ) {
        return current;
      }
      return best;
    });
    const rect = largest.getBoundingClientRect();
    const themedElement =
      grid.querySelector<HTMLElement>('[style*="--gdg-base-font-style"]') ??
      (grid.firstElementChild as HTMLElement | null);
    const computedTheme = themedElement
      ? window.getComputedStyle(themedElement)
      : null;
    const baseFontStyle =
      computedTheme?.getPropertyValue("--gdg-base-font-style").trim() ?? "";
    const baseFontMatch = /([0-9.]+)px/.exec(baseFontStyle);
    const baseFontPx = baseFontMatch ? Number(baseFontMatch[1]) : NaN;
    return {
      densityX: largest.width / Math.max(1, rect.width),
      densityY: largest.height / Math.max(1, rect.height),
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelWidth: largest.width,
      pixelHeight: largest.height,
      baseFontPx,
    };
  });

  if (!metrics) {
    throw new Error("Spreadsheet canvas metrics unavailable.");
  }
  return metrics;
}

function getChildSectionIds(
  latest: LatestProjectStateResponse,
  parentSectionId: string,
): string[] {
  return Object.entries(latest.projectState?.parentSectionMap ?? {})
    .filter(([, parentId]) => parentId === parentSectionId)
    .map(([childId]) => childId);
}

test.describe.serial("section types data authoring", () => {
  test("text block master font slider scales markdown typography", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_textblock_font__",
      );
      await postBackend(page, "/setTextBlockText", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        text: "# Heading\n\nBody text",
      });
      await postBackend(page, "/setTextBlockFormat", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        format: "Markdown",
      });
      await postBackend(page, "/setTextBlockDisplayMode", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        textDisplayMode: "Render",
      });

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const heading = node.locator("h1").first();
      const body = node.locator("p").first();
      await expect(heading).toBeVisible();
      await expect(body).toBeVisible();

      const before = await node.evaluate((el) => {
        const h1 = el.querySelector("h1");
        const p = el.querySelector("p");
        if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
          throw new Error("Missing markdown heading/body nodes.");
        }
        return {
          h1: parseFloat(window.getComputedStyle(h1).fontSize),
          p: parseFloat(window.getComputedStyle(p).fontSize),
        };
      });

      const uiEditorPane = page.locator("#UiEditorPane");
      const masterFontCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Master Font Size" })
        .first();
      await expect(masterFontCard).toBeVisible();

      const slider = masterFontCard.locator('input[type="range"]').first();
      await slider.evaluate((el: HTMLInputElement) => {
        const input = el;
        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        );
        descriptor?.set?.call(input, "24");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await expect.poll(async () => await slider.inputValue()).toBe("24");

      await expect
        .poll(async () => {
          return await node.evaluate((el) => {
            const h1 = el.querySelector("h1");
            const p = el.querySelector("p");
            if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
              return { h1: 0, p: 0 };
            }
            return {
              h1: parseFloat(window.getComputedStyle(h1).fontSize),
              p: parseFloat(window.getComputedStyle(p).fontSize),
            };
          });
        })
        .toEqual(
          expect.objectContaining({
            h1: expect.any(Number),
            p: expect.any(Number),
          }),
        );

      const after = await node.evaluate((el) => {
        const h1 = el.querySelector("h1");
        const p = el.querySelector("p");
        if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
          throw new Error("Missing markdown heading/body nodes.");
        }
        return {
          h1: parseFloat(window.getComputedStyle(h1).fontSize),
          p: parseFloat(window.getComputedStyle(p).fontSize),
        };
      });

      expect(after.h1).toBeGreaterThan(before.h1);
      expect(after.p).toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("list root default child type drives incrementer-created child kind", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { ListRoot: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      const defaultChildCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first();
      await expect(defaultChildCard).toBeVisible();
      const defaultSelect = defaultChildCard.locator("select").first();
      await defaultSelect.selectOption("TextBlock");

      const plusButton = node.locator("button.gg-math-plus").first();
      await expect(plusButton).toBeVisible();
      await plusButton.click();

      await expect
        .poll(async () => {
          const latest = await getLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          const children = getChildSectionIds(latest, sectionId);
          if (children.length === 0) {
            return [];
          }
          const sectionVariantMap =
            latest.projectState?.projectConfig?.sectionVariantMap ?? {};
          const sectionVariants = latest.projectState?.sectionVariants ?? {};
          const sectionImpls = latest.projectState?.sectionImpls ?? {};
          return children
            .map((childId) => sectionVariantMap[childId])
            .filter((variantId): variantId is string => Boolean(variantId))
            .map((variantId) => sectionVariants[variantId]?.impl)
            .filter((implId): implId is string => Boolean(implId))
            .map((implId) => sectionImpls[implId]?.type)
            .filter((type): type is string => Boolean(type));
        })
        .toContain("TextBlock");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("list root view mode toggles between kanban and task list layout", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { ListRoot: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      const defaultChildCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first();
      await expect(defaultChildCard).toBeVisible();
      await defaultChildCard
        .locator("select")
        .first()
        .selectOption("TextBlock");

      const plusButton = node.locator("button.gg-math-plus").first();
      await expect(plusButton).toBeVisible();
      await plusButton.click();
      await plusButton.click();

      await expect
        .poll(async () => {
          const latest = await getLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return getChildSectionIds(latest, sectionId).length;
        })
        .toBeGreaterThanOrEqual(2);
      const latestWithChildren = await getLatestProjectState(
        page,
        projectContext.projectConfigId,
      );
      const childIds = getChildSectionIds(latestWithChildren, sectionId).slice(
        0,
        2,
      );

      await expect(defaultChildCard).toContainText("List Root View");
      let viewModeSelect = defaultChildCard.locator("select").nth(1);
      await expect(viewModeSelect).toBeVisible();

      await viewModeSelect.selectOption("kanban");
      await expect(viewModeSelect).toHaveValue("kanban");

      const kanbanDistances = await page.evaluate((ids) => {
        const first = document.querySelector(
          `[data-sortable-section-id="${ids[0]}"]`,
        ) as HTMLElement | null;
        const second = document.querySelector(
          `[data-sortable-section-id="${ids[1]}"]`,
        ) as HTMLElement | null;
        if (!first || !second) {
          return null;
        }
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return {
          xDelta: Math.abs(firstRect.x - secondRect.x),
          yDelta: Math.abs(firstRect.y - secondRect.y),
        };
      }, childIds);
      expect(kanbanDistances).not.toBeNull();
      expect(
        (kanbanDistances?.xDelta ?? 0) > (kanbanDistances?.yDelta ?? 0),
      ).toBe(true);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");
      const reloadedNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(reloadedNode).toBeVisible();
      await reloadedNode.click();
      viewModeSelect = page
        .locator("#UiEditorPane")
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first()
        .locator("select")
        .nth(1);
      await expect(viewModeSelect).toHaveValue("kanban");

      await viewModeSelect.selectOption("task_list");
      await expect(viewModeSelect).toHaveValue("task_list");

      const taskListDistances = await page.evaluate((ids) => {
        const first = document.querySelector(
          `[data-sortable-section-id="${ids[0]}"]`,
        ) as HTMLElement | null;
        const second = document.querySelector(
          `[data-sortable-section-id="${ids[1]}"]`,
        ) as HTMLElement | null;
        if (!first || !second) {
          return null;
        }
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return {
          xDelta: Math.abs(firstRect.x - secondRect.x),
          yDelta: Math.abs(firstRect.y - secondRect.y),
        };
      }, childIds);
      expect(taskListDistances).not.toBeNull();
      expect(
        (taskListDistances?.yDelta ?? 0) >= (taskListDistances?.xDelta ?? 0),
      ).toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("task board and spreadsheet sections are visible and interactive", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const root = await postBackend<FileBrowserRootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }
      const csvPath = `${rootPath}/pw-spreadsheet-section.csv`;
      await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");

      const taskBoardSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "TaskBoard",
      );
      const spreadsheetSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Spreadsheet",
      );
      const browserSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Browser",
      );

      const taskBoardNode = page.locator(
        `.react-flow__node[data-id="${taskBoardSectionId}"]`,
      );
      const spreadsheetNode = page.locator(
        `.react-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.react-flow__node[data-id="${browserSectionId}"]`,
      );

      await expect(taskBoardNode).toBeVisible();
      await expect(spreadsheetNode).toBeVisible();
      await expect(browserNode).toBeVisible();

      await taskBoardNode
        .getByPlaceholder("Add task title")
        .fill("ship task board");
      await taskBoardNode.getByTestId("task-board-add-task").click();
      await expect(
        taskBoardNode.locator('input[value="ship task board"]').first(),
      ).toBeVisible();
      await taskBoardNode.getByTestId("task-board-view-kanban").click();
      await expect(
        taskBoardNode.locator("[data-task-board-column-id]"),
      ).toHaveCount(3);

      await expect(
        spreadsheetNode.getByPlaceholder("/absolute/path/to/file.csv"),
      ).toHaveCount(0);
      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      const csvRow = browserExplorer
        .locator("button")
        .filter({ hasText: "pw-spreadsheet-section.csv" })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );
      const spreadsheetGlideGrid = spreadsheetNode.getByTestId(
        "spreadsheet-glide-grid",
      );
      await expect(spreadsheetGlideGrid).toBeVisible();
      await expect(
        spreadsheetNode.getByText("2 rows · 2 columns"),
      ).toBeVisible();
      const filterInput = spreadsheetNode.getByTestId(
        "spreadsheet-filter-input",
      );
      await filterInput.fill("alpha");
      await expect(
        spreadsheetNode.getByText("1 shown of 2 rows · 2 columns"),
      ).toBeVisible();
      const sortColumn = spreadsheetNode.getByTestId("spreadsheet-sort-column");
      await sortColumn.selectOption("1");
      await expect(sortColumn).toHaveValue("1");
      await spreadsheetNode.getByTestId("spreadsheet-sort-direction").click();
      await spreadsheetNode.getByTestId("spreadsheet-clear-view").click();
      await expect(filterInput).toHaveValue("");
      await expect(
        spreadsheetNode.getByText("2 rows · 2 columns"),
      ).toBeVisible();

      // Validate baseline in-grid interactions: click select, drag-range select,
      // and direct type-to-edit.
      const gridCanvas = spreadsheetGlideGrid.locator("canvas").first();
      await expect(gridCanvas).toBeVisible();
      await gridCanvas.click({ position: { x: 80, y: 50 } });
      const selectionSummary = spreadsheetNode.getByTestId(
        "spreadsheet-selection-summary",
      );
      await expect(selectionSummary).toContainText("Selected");
      const gridBounds = await gridCanvas.boundingBox();
      if (!gridBounds) {
        throw new Error("Spreadsheet grid canvas bounds unavailable.");
      }
      await page.mouse.move(gridBounds.x + 80, gridBounds.y + 50);
      await page.mouse.down();
      await page.mouse.move(gridBounds.x + 250, gridBounds.y + 90);
      await page.mouse.up();
      await expect(selectionSummary).toContainText(":");

      const editPosition = { x: 80, y: 50 };
      await gridCanvas.click({ position: editPosition });
      await expect(selectionSummary).toContainText("Selected");
      await gridCanvas.click({ position: editPosition });
      const overlayEditor = page.locator("#portal .gdg-input").first();
      await expect(overlayEditor).toBeVisible();
      await overlayEditor.fill("done");
      await overlayEditor.press("Enter");
      await expect(spreadsheetNode.getByText("Unsaved edits.")).toBeVisible();

      const spreadsheetAddRow = spreadsheetNode.getByTestId(
        "spreadsheet-add-row",
      );
      await expect(spreadsheetAddRow).toBeEnabled();
      await spreadsheetNode.click();
      const uiEditorPane = page.locator("#UiEditorPane");
      const readOnlyToggleLabel = uiEditorPane
        .locator("label")
        .filter({ hasText: "Read-only grid" })
        .first();
      await expect(readOnlyToggleLabel).toBeVisible();
      const readOnlyToggle = readOnlyToggleLabel
        .locator('input[type="checkbox"]')
        .first();
      await expect(readOnlyToggle).toBeAttached();
      await readOnlyToggleLabel.click();
      await expect(readOnlyToggle).toBeChecked();
      await expect(spreadsheetAddRow).toBeDisabled();
      await expect(spreadsheetNode.getByText("Read-only.")).toBeVisible();
      await readOnlyToggleLabel.click();
      await expect(readOnlyToggle).not.toBeChecked();
      await expect(spreadsheetAddRow).toBeEnabled();

      const rowNumbersToggleLabel = uiEditorPane
        .locator("label")
        .filter({ hasText: "Show row numbers" })
        .first();
      const rowNumbersToggle = rowNumbersToggleLabel
        .locator('input[type="checkbox"]')
        .first();
      await rowNumbersToggleLabel.click();
      await expect(rowNumbersToggle).not.toBeChecked();

      const densitySelect = uiEditorPane
        .locator("label")
        .filter({ hasText: "Grid density" })
        .locator("select")
        .first();
      await densitySelect.selectOption("comfortable");
      await expect(densitySelect).toHaveValue("comfortable");

      await spreadsheetAddRow.click();
      await expect(spreadsheetNode.getByText("Unsaved edits.")).toBeVisible();
      await spreadsheetNode.getByTestId("spreadsheet-save").click();
      await expect(spreadsheetNode.getByText("Saved.")).toBeVisible();

      const csvRead = await postBackend<FileBrowserFileContentResponse>(
        page,
        "/getFileBrowserFileContent",
        { path: csvPath },
      );
      const csvDecoded = Buffer.from(
        csvRead?.contentBase64 ?? "",
        "base64",
      ).toString("utf-8");
      expect(csvDecoded).toContain("done");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("spreadsheet filter and sort controls render correctly in dark mode", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "dark",
      darkMode: true,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const root = await postBackend<FileBrowserRootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }
      const csvPath = `${rootPath}/pw-dark-sheet.csv`;
      await fs.writeFile(
        csvPath,
        "task,status\nalpha,todo\nbeta,done\n",
        "utf-8",
      );

      const spreadsheetSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Spreadsheet",
      );
      const browserSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Browser",
      );

      const spreadsheetNode = page.locator(
        `.react-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.react-flow__node[data-id="${browserSectionId}"]`,
      );
      await expect(spreadsheetNode).toBeVisible();
      await expect(browserNode).toBeVisible();

      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      const csvRow = browserExplorer
        .locator("button")
        .filter({ hasText: "pw-dark-sheet.csv" })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );

      const filterInput = spreadsheetNode.getByTestId(
        "spreadsheet-filter-input",
      );
      await expect(filterInput).toBeVisible();
      const sortColumn = spreadsheetNode.getByTestId("spreadsheet-sort-column");
      await expect(sortColumn).toBeVisible();
      const pageIsDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );
      expect(pageIsDark).toBe(true);

      const filterStyles = await filterInput.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          borderColor: styles.borderColor,
        };
      });
      expect(filterStyles.backgroundColor).not.toBe("rgb(255, 255, 255)");
      expect(filterStyles.color).not.toBe("rgb(0, 0, 0)");
      expect(filterStyles.borderColor).not.toBe("rgb(0, 0, 0)");

      const glideBgCell = await spreadsheetNode
        .getByTestId("spreadsheet-glide-grid")
        .evaluate((element) => {
          const themedElement =
            element.querySelector<HTMLElement>('[style*="--gdg-bg-cell"]') ??
            (element.firstElementChild as HTMLElement | null);
          if (!themedElement) {
            return "";
          }
          const computed = window.getComputedStyle(themedElement);
          return (
            computed.getPropertyValue("--gdg-bg-cell").trim() ||
            computed.backgroundColor
          );
        });
      expect(glideBgCell).not.toContain("255, 255, 255");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("spreadsheet zoom rendering stays stable across five zoom levels", async ({
    page,
  }, testInfo) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const root = await postBackend<FileBrowserRootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }
      const csvPath = `${rootPath}/pw-zoom-sheet.csv`;
      await fs.writeFile(
        csvPath,
        "task,status\nalpha,done\nbeta,todo\ngamma,todo\n",
        "utf-8",
      );

      const spreadsheetSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Spreadsheet",
      );
      const browserSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Browser",
      );

      const spreadsheetNode = page.locator(
        `.react-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.react-flow__node[data-id="${browserSectionId}"]`,
      );
      await expect(spreadsheetNode).toBeVisible();
      await expect(browserNode).toBeVisible();

      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      const csvRow = browserExplorer
        .locator("button")
        .filter({ hasText: "pw-zoom-sheet.csv" })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );

      const spreadsheetGrid = spreadsheetNode.getByTestId(
        "spreadsheet-glide-grid",
      );
      await expect(spreadsheetGrid).toBeVisible();
      await expect(
        spreadsheetNode.getByText("4 rows · 2 columns"),
      ).toBeVisible();

      const zoomPresets = [
        { label: "zoom-out-6", zoomOutClicks: 6, zoomInClicks: 0 },
        { label: "zoom-out-3", zoomOutClicks: 3, zoomInClicks: 0 },
        { label: "zoom-reset", zoomOutClicks: 0, zoomInClicks: 0 },
        { label: "zoom-in-4", zoomOutClicks: 0, zoomInClicks: 4 },
        { label: "zoom-in-8", zoomOutClicks: 0, zoomInClicks: 8 },
      ] as const;

      const samples: Array<{
        label: string;
        zoom: number;
        densityX: number;
        densityY: number;
        baseFontPx: number;
        effectiveFontPx: number;
      }> = [];

      for (const preset of zoomPresets) {
        const zoom = await applyZoomPreset(
          page,
          preset.zoomOutClicks,
          preset.zoomInClicks,
        );
        const metrics =
          await getSpreadsheetCanvasDensityMetrics(spreadsheetNode);
        samples.push({
          label: preset.label,
          zoom,
          densityX: metrics.densityX,
          densityY: metrics.densityY,
          baseFontPx: metrics.baseFontPx,
          effectiveFontPx:
            (metrics.baseFontPx /
              getExpectedSpreadsheetDensityMultiplier(zoom)) *
            zoom,
        });

        await testInfo.attach(`spreadsheet-${preset.label}.png`, {
          body: await spreadsheetNode.screenshot(),
          contentType: "image/png",
        });
      }

      const zoomValues = samples.map((sample) => sample.zoom);
      expect(new Set(zoomValues.map((zoom) => zoom.toFixed(3))).size).toBe(5);

      const sortedByZoom = [...samples].sort(
        (left, right) => left.zoom - right.zoom,
      );
      for (const sample of sortedByZoom) {
        expect(Number.isFinite(sample.baseFontPx)).toBe(true);
        expect(Number.isFinite(sample.effectiveFontPx)).toBe(true);
      }
      expect(sortedByZoom[0]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[1]?.zoom ?? 0,
      );
      expect(sortedByZoom[1]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[2]?.zoom ?? 0,
      );
      expect(sortedByZoom[2]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[3]?.zoom ?? 0,
      );
      expect(sortedByZoom[3]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[4]?.zoom ?? 0,
      );
      expect(
        (sortedByZoom[4]?.zoom ?? 0) - (sortedByZoom[0]?.zoom ?? 0),
      ).toBeGreaterThan(0.5);

      const maxSample = sortedByZoom[4];
      const midInSample = sortedByZoom[3];
      const farOutSample = sortedByZoom[0];
      if (!maxSample || !midInSample || !farOutSample) {
        throw new Error(
          "Missing zoom sample set for spreadsheet density checks.",
        );
      }

      expect(maxSample.densityX).toBeGreaterThanOrEqual(0.95);
      expect(maxSample.densityX).toBeGreaterThanOrEqual(
        midInSample.densityX * 0.9,
      );
      expect(maxSample.densityY).toBeGreaterThanOrEqual(0.95);
      expect(farOutSample.densityX).toBeGreaterThanOrEqual(1);
      expect(farOutSample.densityY).toBeGreaterThanOrEqual(1);

      expect(sortedByZoom[0]?.effectiveFontPx ?? 0).toBeLessThan(
        sortedByZoom[1]?.effectiveFontPx ?? 0,
      );
      expect(sortedByZoom[1]?.effectiveFontPx ?? 0).toBeLessThan(
        sortedByZoom[2]?.effectiveFontPx ?? 0,
      );
      expect(sortedByZoom[2]?.effectiveFontPx ?? 0).toBeLessThan(
        sortedByZoom[3]?.effectiveFontPx ?? 0,
      );
      expect(sortedByZoom[3]?.effectiveFontPx ?? 0).toBeLessThan(
        sortedByZoom[4]?.effectiveFontPx ?? 0,
      );

      await testInfo.attach("spreadsheet-zoom-density-metrics.json", {
        body: Buffer.from(JSON.stringify(samples, null, 2), "utf-8"),
        contentType: "application/json",
      });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("file browser uses bottom universal preview with csv/xlsx/pdf support", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "FileBrowser",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const root = await postBackend<FileBrowserRootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }

      const csvPath = `${rootPath}/pw-sheet.csv`;
      await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");
      const pdfPath = `${rootPath}/pw-sheet.pdf`;
      await fs.writeFile(
        pdfPath,
        Buffer.from(
          "%PDF-1.1\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 38 >>\nstream\nBT /F1 14 Tf 24 60 Td (PDF Preview) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000202 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n287\n%%EOF\n",
          "utf-8",
        ),
      );

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ["Task", "Owner"],
        ["Beta", "Dev"],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const xlsxBytes = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;
      const xlsxPath = `${rootPath}/pw-sheet.xlsx`;
      await fs.writeFile(xlsxPath, xlsxBytes);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");

      const listPane = page.getByTestId("file-browser-list-pane");
      const previewPane = page.getByTestId("file-browser-preview-pane");
      const previewToggle = page.getByTestId("file-browser-preview-toggle");
      const previewResizeHandle = page.getByTestId(
        "file-browser-preview-resize-handle",
      );
      await expect(listPane).toBeVisible();
      await expect(previewPane).toBeVisible();
      await expect(previewToggle).toBeVisible();
      await expect(previewResizeHandle).toBeVisible();
      const listBox = await listPane.boundingBox();
      const previewBox = await previewPane.boundingBox();
      if (!listBox || !previewBox) {
        throw new Error("Missing file browser pane bounding boxes.");
      }
      expect(previewBox.y).toBeGreaterThan(listBox.y + 10);

      const resizeBox = await previewResizeHandle.boundingBox();
      if (!resizeBox) {
        throw new Error("Missing preview resize handle bounds.");
      }
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2,
        resizeBox.y + resizeBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2,
        resizeBox.y + resizeBox.height / 2 + 80,
      );
      await page.mouse.up();

      const resizedListBox = await listPane.boundingBox();
      const resizedPreviewBox = await previewPane.boundingBox();
      if (!resizedListBox || !resizedPreviewBox) {
        throw new Error("Missing resized pane bounds.");
      }
      expect(resizedListBox.height).toBeGreaterThan(listBox.height + 20);
      expect(resizedPreviewBox.height).toBeLessThan(previewBox.height - 20);

      await previewToggle.click();
      await expect(page.getByTestId("file-browser-preview-pane")).toHaveCount(
        0,
      );
      await previewToggle.click();
      await expect(page.getByTestId("file-browser-preview-pane")).toBeVisible();

      const pdfRow = page.locator("button").filter({ hasText: "pw-sheet.pdf" });
      await expect(pdfRow).toBeVisible({ timeout: 20000 });
      await pdfRow.first().click();
      await expect(
        previewPane.locator('[data-spreadsheet-cell="1:1"]'),
      ).toHaveCount(0);
      await expect
        .poll(async () => {
          const pdfCount = await page
            .getByTestId("file-browser-universal-preview-pdf")
            .count();
          const unavailableCount = await previewPane
            .getByText("Preview unavailable.")
            .count();
          return pdfCount + unavailableCount;
        })
        .toBeGreaterThan(0);

      const csvRow = page.locator("button").filter({ hasText: "pw-sheet.csv" });
      await expect(csvRow).toBeVisible({ timeout: 20000 });
      await csvRow.first().click();

      const targetCell = previewPane
        .locator('[data-spreadsheet-cell="1:1"]')
        .first();
      await expect(targetCell).toBeVisible();
      await targetCell.fill("done");
      await page.getByTestId("spreadsheet-save").click();
      await expect(page.getByText("Saved.")).toBeVisible();

      const csvRead = await postBackend<FileBrowserFileContentResponse>(
        page,
        "/getFileBrowserFileContent",
        { path: csvPath },
      );
      const csvDecoded = Buffer.from(
        csvRead?.contentBase64 ?? "",
        "base64",
      ).toString("utf-8");
      expect(csvDecoded).toContain("alpha,done");

      const xlsxRow = page
        .locator("button")
        .filter({ hasText: "pw-sheet.xlsx" });
      await expect(xlsxRow).toBeVisible({ timeout: 20000 });
      await xlsxRow.first().click();

      const xlsxCell = previewPane
        .locator('[data-spreadsheet-cell="1:0"]')
        .first();
      await expect(xlsxCell).toBeVisible();
      await expect(xlsxCell).toHaveValue("Beta");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
