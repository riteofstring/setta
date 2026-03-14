import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
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

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

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
  contentId: string;
};

async function readFileBrowserText(
  page: Page,
  filePath: string,
): Promise<string> {
  const fileRead = await postBackend<FileBrowserFileContentResponse>(
    page,
    "/getFileBrowserFileContent",
    { path: filePath },
  );
  const contentId = fileRead?.contentId;
  if (!contentId) {
    throw new Error("Missing file browser content id.");
  }
  const binaryResponse = await page.request.get(
    `${BACKEND_ORIGIN}/api/binary/${encodeURIComponent(contentId)}`,
  );
  if (!binaryResponse.ok()) {
    throw new Error(
      `Failed to download binary file payload (${binaryResponse.status()}).`,
    );
  }
  return binaryResponse.text();
}

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

async function dragPointerSurfaceToTarget(
  source: Locator,
  target: Locator,
  options?: {
    sourcePosition?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
  },
): Promise<void> {
  const sourcePosition = options?.sourcePosition ?? { x: 3, y: 3 };
  const targetPosition = options?.targetPosition ?? { x: 3, y: 3 };
  const page = source.page();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error("Source drag surface bounds unavailable.");
  }
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Target drag surface bounds unavailable.");
  }
  await page.mouse.move(
    sourceBox.x + sourcePosition.x,
    sourceBox.y + sourcePosition.y,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetPosition.x,
    targetBox.y + targetPosition.y,
    {
      steps: 12,
    },
  );
  await page.mouse.up();
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

const ZOOM_EPSILON = 0.0005;

async function waitForViewportScaleToStabilize(page: Page): Promise<number> {
  const timeoutMs = 3000;
  const pollIntervalMs = 50;
  const requiredStableSamples = 2;
  const deadline = Date.now() + timeoutMs;
  let previousZoom = await getViewportScale(page);
  let stableSampleCount = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollIntervalMs);
    const currentZoom = await getViewportScale(page);
    if (Math.abs(currentZoom - previousZoom) <= ZOOM_EPSILON) {
      stableSampleCount += 1;
      if (stableSampleCount >= requiredStableSamples) {
        return currentZoom;
      }
    } else {
      stableSampleCount = 0;
    }
    previousZoom = currentZoom;
  }

  throw new Error("Viewport zoom did not stabilize in time.");
}

async function clickAndWaitForViewportScaleChange(
  page: Page,
  zoomButton: Locator,
): Promise<void> {
  const previousZoom = await getViewportScale(page);
  await zoomButton.click();
  await expect
    .poll(
      async () =>
        Math.abs((await getViewportScale(page)) - previousZoom) > ZOOM_EPSILON,
      {
        timeout: 3000,
      },
    )
    .toBe(true);
  await waitForViewportScaleToStabilize(page);
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
  await waitForViewportScaleToStabilize(page);

  for (let i = 0; i < zoomOutClicks; i += 1) {
    await clickAndWaitForViewportScaleChange(page, zoomOutButton);
  }
  for (let i = 0; i < zoomInClicks; i += 1) {
    await clickAndWaitForViewportScaleChange(page, zoomInButton);
  }
  await expect
    .poll(async () => await getViewportScale(page))
    .toBeGreaterThan(0);
  return waitForViewportScaleToStabilize(page);
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
    let setMasterFontSizeCallCount = 0;
    const handleSetMasterFontSizeRequest = (request: Request): void => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/setTextBlockMasterFontSize")
      ) {
        setMasterFontSizeCallCount += 1;
      }
    };
    page.on("request", handleSetMasterFontSizeRequest);

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
        input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        for (const nextValue of ["20", "22", "24"]) {
          descriptor?.set?.call(input, nextValue);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      });
      await expect.poll(async () => await slider.inputValue()).toBe("24");
      await expect
        .poll(() => setMasterFontSizeCallCount)
        .toBe(1);

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
      page.off("request", handleSetMasterFontSizeRequest);
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
    let setTopLevelLayoutCalls = 0;
    const handleSetTopLevelLayoutRequest = (request: Request): void => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/setTopLevelSectionLayout")
      ) {
        setTopLevelLayoutCalls += 1;
      }
    };
    page.on("request", handleSetTopLevelLayoutRequest);

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
      const taskBoardMainSurface = taskBoardNode
        .locator(".section-main.section-main-full-w")
        .first();
      const taskBoardMainSurfaceMetrics = await taskBoardMainSurface.evaluate(
        (element) => {
          const style = window.getComputedStyle(element as HTMLElement);
          return {
            borderTop: Number.parseFloat(style.borderTopWidth),
            borderRight: Number.parseFloat(style.borderRightWidth),
            borderBottom: Number.parseFloat(style.borderBottomWidth),
            borderLeft: Number.parseFloat(style.borderLeftWidth),
            paddingTop: Number.parseFloat(style.paddingTop),
            paddingRight: Number.parseFloat(style.paddingRight),
            paddingBottom: Number.parseFloat(style.paddingBottom),
            paddingLeft: Number.parseFloat(style.paddingLeft),
          };
        },
      );
      expect(taskBoardMainSurfaceMetrics.borderTop).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.borderRight).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.borderBottom).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.borderLeft).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.paddingTop).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.paddingRight).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.paddingBottom).toBeLessThan(0.5);
      expect(taskBoardMainSurfaceMetrics.paddingLeft).toBeLessThan(0.5);

      await taskBoardNode.getByTestId("task-board-view-task-list").click();
      const taskTitleInput = taskBoardNode.getByPlaceholder("Add task title");
      await taskTitleInput.fill("ship task board");
      await taskTitleInput.press("Enter");
      await taskTitleInput.fill("schedule followup");
      await taskTitleInput.press("Enter");
      await expect(
        taskBoardNode.locator('input[value="ship task board"]').first(),
      ).toBeVisible();
      const taskListRows = taskBoardNode.locator("[data-task-board-task-id]");
      await expect(taskListRows).toHaveCount(2);
      await expect(
        taskBoardNode.getByTestId("task-board-task-list-header-done"),
      ).toHaveCount(0);
      const firstListRow = taskListRows.first();
      const firstListRowDragHandle = firstListRow.getByTestId(
        "task-board-task-drag-handle",
      );
      const firstListRowDoneCheckbox = firstListRow.getByTestId(
        "task-board-task-list-done-checkbox",
      );
      const firstListRowTaskInput = firstListRow.locator('input[type="text"]').first();
      const [firstListRowBounds, dragHandleBounds, doneCheckboxBounds, taskInputBounds] =
        await Promise.all([
          firstListRow.boundingBox(),
          firstListRowDragHandle.boundingBox(),
          firstListRowDoneCheckbox.boundingBox(),
          firstListRowTaskInput.boundingBox(),
        ]);
      if (!firstListRowBounds) {
        throw new Error("Expected first task list row bounds.");
      }
      if (!dragHandleBounds) {
        throw new Error("Expected first task list drag handle bounds.");
      }
      if (!doneCheckboxBounds) {
        throw new Error("Expected first task list checkbox bounds.");
      }
      if (!taskInputBounds) {
        throw new Error("Expected first task list title input bounds.");
      }
      expect(dragHandleBounds.x).toBeLessThan(doneCheckboxBounds.x);
      expect(dragHandleBounds.x - firstListRowBounds.x).toBeLessThan(16);
      expect(doneCheckboxBounds.x).toBeLessThan(taskInputBounds.x);
      expect(taskInputBounds.x - doneCheckboxBounds.x).toBeLessThan(36);
      const firstTaskRow = taskListRows.nth(0);
      await firstTaskRow
        .locator('[data-testid^="task-board-task-schedule-menu-"]')
        .click();
      const schedulePopover = page
        .locator('[data-testid^="task-board-task-schedule-content-"]')
        .first();
      await expect(schedulePopover).toBeVisible();
      await schedulePopover
        .locator('select[data-testid^="task-board-task-due-mode-"]')
        .selectOption("date_time");
      await schedulePopover
        .locator('input[data-testid^="task-board-task-due-value-"]')
        .fill("2026-03-01T09:15");
      await schedulePopover
        .locator('[data-testid^="task-board-task-recurrence-mode-"]')
        .selectOption("specified_days");
      await schedulePopover.getByRole("button", { name: "Mon" }).click();
      await page.keyboard.press("Escape");
      const firstTaskDescriptionToggle = firstTaskRow
        .locator('[data-testid^="task-board-task-description-toggle-"]')
        .first();
      await firstTaskDescriptionToggle.click();
      const firstTaskDescriptionInput = firstTaskRow
        .locator('[data-testid^="task-board-task-description-input-"]')
        .first();
      await expect(firstTaskDescriptionInput).toBeVisible();
      await firstTaskDescriptionInput.fill("follow-up checklist");
      await firstTaskDescriptionInput.blur();
      await firstTaskDescriptionToggle.click();
      await expect(
        firstTaskRow.locator('[data-testid^="task-board-task-description-input-"]'),
      ).toHaveCount(0);

      const firstRowDragSurface = taskListRows.nth(0);
      const secondRowDragSurface = taskListRows.nth(1);
      await expect(secondRowDragSurface).toBeVisible();
      const firstRowDragHandle = firstRowDragSurface.getByTestId(
        "task-board-task-drag-handle",
      );
      const secondRowDragHandle = secondRowDragSurface.getByTestId(
        "task-board-task-drag-handle",
      );
      const setTopLevelLayoutCallsBeforeListDrag = setTopLevelLayoutCalls;
      await dragPointerSurfaceToTarget(
        firstRowDragHandle,
        secondRowDragHandle,
        {
          sourcePosition: { x: 8, y: 8 },
          targetPosition: { x: 8, y: 8 },
        },
      );
      await expect(
        taskListRows.nth(0).locator('input[type="text"]').first(),
      ).toHaveValue("ship task board");
      expect(setTopLevelLayoutCalls).toBe(setTopLevelLayoutCallsBeforeListDrag);

      await taskBoardNode.getByTestId("task-board-view-kanban").click();
      await expect(
        taskBoardNode.locator("[data-task-board-column-id]"),
      ).toHaveCount(3);
      await expect(taskBoardNode.getByTestId("task-board-add-task")).toHaveCount(0);
      const kanbanAddTaskButtons = taskBoardNode.locator(
        '[data-testid^="task-board-kanban-add-task-"]',
      );
      await expect(kanbanAddTaskButtons).toHaveCount(3);
      await expect(kanbanAddTaskButtons.first()).toHaveText("Task");
      const kanbanResizeHandles = taskBoardNode.locator(
        '[data-testid^="task-board-kanban-resize-handle-"]',
      );
      await expect(kanbanResizeHandles).toHaveCount(2);
      const firstLane = taskBoardNode
        .locator("[data-task-board-column-id]")
        .nth(0);
      const [firstLaneBoundsBeforeResize, firstResizeHandleBounds] =
        await Promise.all([
          firstLane.boundingBox(),
          kanbanResizeHandles.first().boundingBox(),
        ]);
      if (!firstLaneBoundsBeforeResize) {
        throw new Error("First kanban lane bounds unavailable before resize.");
      }
      if (!firstResizeHandleBounds) {
        throw new Error("First kanban resize handle bounds unavailable.");
      }
      await page.mouse.move(
        firstResizeHandleBounds.x + firstResizeHandleBounds.width / 2,
        firstResizeHandleBounds.y + firstResizeHandleBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        firstResizeHandleBounds.x + firstResizeHandleBounds.width / 2 + 36,
        firstResizeHandleBounds.y + firstResizeHandleBounds.height / 2,
        { steps: 10 },
      );
      await page.mouse.up();
      const firstLaneBoundsAfterResize = await firstLane.boundingBox();
      if (!firstLaneBoundsAfterResize) {
        throw new Error("First kanban lane bounds unavailable after resize.");
      }
      expect(
        firstLaneBoundsAfterResize.width - firstLaneBoundsBeforeResize.width,
      ).toBeGreaterThan(8);
      const firstLaneTasks = firstLane.locator("[data-task-board-task-id]");
      await expect(firstLaneTasks).toHaveCount(2);
      const firstKanbanDragSurface = firstLaneTasks.first();
      const secondKanbanDragSurface = firstLaneTasks.nth(1);
      const firstKanbanDragHandle = firstKanbanDragSurface.getByTestId(
        "task-board-task-drag-handle",
      );
      const secondKanbanDragHandle = secondKanbanDragSurface.getByTestId(
        "task-board-task-drag-handle",
      );
      const [secondKanbanCardBounds, secondKanbanHandleBounds] = await Promise.all([
        secondKanbanDragSurface.boundingBox(),
        secondKanbanDragHandle.boundingBox(),
      ]);
      if (!secondKanbanCardBounds) {
        throw new Error("Second kanban task bounds unavailable.");
      }
      if (!secondKanbanHandleBounds) {
        throw new Error("Second kanban drag handle bounds unavailable.");
      }
      expect(secondKanbanHandleBounds.width).toBeGreaterThanOrEqual(26);
      expect(secondKanbanHandleBounds.x - secondKanbanCardBounds.x).toBeLessThan(12);
      const kanbanTopInset = secondKanbanHandleBounds.y - secondKanbanCardBounds.y;
      const kanbanBottomInset =
        secondKanbanCardBounds.y +
        secondKanbanCardBounds.height -
        (secondKanbanHandleBounds.y + secondKanbanHandleBounds.height);
      expect(Math.abs(kanbanTopInset - kanbanBottomInset)).toBeLessThan(5);
      const setTopLevelLayoutCallsBeforeKanbanDrag = setTopLevelLayoutCalls;
      const kanbanSourceBounds = await firstKanbanDragHandle.boundingBox();
      if (!kanbanSourceBounds) {
        throw new Error("Kanban source bounds unavailable.");
      }
      const kanbanTargetBounds = await secondKanbanDragSurface.boundingBox();
      if (!kanbanTargetBounds) {
        throw new Error("Kanban target bounds unavailable.");
      }
      await page.mouse.move(
        kanbanSourceBounds.x + kanbanSourceBounds.width / 2,
        kanbanSourceBounds.y + kanbanSourceBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        kanbanTargetBounds.x + Math.min(24, kanbanTargetBounds.width - 8),
        kanbanTargetBounds.y + kanbanTargetBounds.height + 24,
        {
          steps: 12,
        },
      );
      await page.mouse.up();
      const firstLaneTaskTitles = await firstLaneTasks
        .locator('input[type="text"]')
        .evaluateAll((elements) =>
          elements
            .map((element) => (element as HTMLInputElement).value)
            .sort((left, right) => left.localeCompare(right)),
        );
      expect(firstLaneTaskTitles).toEqual(["schedule followup", "ship task board"]);
      expect(setTopLevelLayoutCalls).toBe(
        setTopLevelLayoutCallsBeforeKanbanDrag,
      );

      await taskBoardNode.getByTestId("task-board-view-task-list").click();
      const refreshedTaskRows = taskBoardNode.locator(
        "[data-task-board-task-id]",
      );
      const firstRowColumnSelect = refreshedTaskRows
        .first()
        .locator("select")
        .first();
      const firstRowDoneCheckbox = refreshedTaskRows
        .first()
        .getByTestId("task-board-task-list-done-checkbox");
      await firstRowDoneCheckbox.check();
      await expect(firstRowDoneCheckbox).toBeChecked();
      await expect(firstRowColumnSelect.locator("option:checked")).toHaveText(
        "Done",
      );

      await taskBoardNode.getByTestId("task-board-view-kanban").click();
      const doneLane = taskBoardNode
        .locator("[data-task-board-column-id]")
        .nth(2);
      const doneLaneTasks = doneLane.locator("[data-task-board-task-id]");
      await expect(doneLaneTasks).toHaveCount(1);
      await expect(
        doneLaneTasks.first().locator('input[type="checkbox"]'),
      ).toHaveCount(0);
      await taskBoardNode.getByTestId("task-board-view-task-list").click();
      const taskRowsBeforeDelete = taskBoardNode.locator("[data-task-board-task-id]");
      await expect(taskRowsBeforeDelete).toHaveCount(2);
      await taskRowsBeforeDelete
        .nth(1)
        .locator('[data-testid^="task-board-task-remove-"]')
        .first()
        .click();
      await expect(taskRowsBeforeDelete).toHaveCount(1);
      await taskBoardNode.getByTestId("task-board-view-kanban").click();
      const allKanbanTasksAfterDelete = taskBoardNode.locator(
        "[data-task-board-column-id] [data-task-board-task-id]",
      );
      await expect(allKanbanTasksAfterDelete).toHaveCount(1);

      await expect(
        spreadsheetNode.getByPlaceholder("/absolute/path/to/file.csv"),
      ).toHaveCount(0);
      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      await expect(
        browserExplorer
          .locator("button")
          .filter({ hasText: "pw-spreadsheet-section.csv" })
          .first(),
      ).toBeVisible({ timeout: 15000 });
      await postBackend(page, "/setSpreadsheetFilePath", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: spreadsheetSectionId,
        filePath: csvPath,
        activeSheet: null,
      });
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
      await expect(spreadsheetNode.getByTestId("spreadsheet-save")).toBeEnabled();
    } finally {
      page.off("request", handleSetTopLevelLayoutRequest);
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
        { label: "zoom-in-2", zoomOutClicks: 0, zoomInClicks: 2 },
        { label: "zoom-in-4", zoomOutClicks: 0, zoomInClicks: 4 },
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

      await testInfo.attach("spreadsheet-zoom-density-metrics.json", {
        body: Buffer.from(JSON.stringify(samples, null, 2), "utf-8"),
        contentType: "application/json",
      });

      const zoomValues = samples.map((sample) => sample.zoom);
      const distinctZoomCount = new Set(
        zoomValues.map((zoom) => zoom.toFixed(3)),
      ).size;
      expect(
        distinctZoomCount,
        `Unexpected zoom levels: ${JSON.stringify(zoomValues)}`,
      ).toBe(5);

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

      const effectiveFontPxByZoom = sortedByZoom.map(
        (sample) => sample.effectiveFontPx,
      );
      const effectiveFontDebug = JSON.stringify(effectiveFontPxByZoom);
      expect(
        sortedByZoom[0]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[1]?.effectiveFontPx ?? 0);
      expect(
        sortedByZoom[1]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[2]?.effectiveFontPx ?? 0);
      expect(
        sortedByZoom[2]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[3]?.effectiveFontPx ?? 0);
      expect(
        sortedByZoom[3]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[4]?.effectiveFontPx ?? 0);

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
      await expect(targetCell).toHaveValue("todo");
      await targetCell.fill("done");
      await targetCell.press("Enter");
      await expect(previewPane.getByText("Unsaved edits.")).toBeVisible();
      await expect(targetCell).toHaveValue("done");

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
