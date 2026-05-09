import { expect, test, type Request } from "@playwright/test";
import fs from "node:fs/promises";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";
import {
  createChildSectionsViaIncrementerFromFrontend,
  createTopLevelSection,
  dragPointerSurfaceToTarget,
  getChildSectionIds,
  getLatestProjectState,
  getSortableSectionDistances,
  type RootResponse,
} from "./section-types-data-authoring-helpers";

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
    await clearProjectChatWindows(page);
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
      await applyProjectMutationsFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        operations: [
          {
            operationName: "setTextBlockText",
            body: {
              sectionId,
              text: "# Heading\n\nBody text",
              frontendOpId: null,
            },
          },
          {
            operationName: "setTextBlockFormat",
            body: {
              sectionId,
              format: "Markdown",
              frontendOpId: null,
            },
          },
          {
            operationName: "setTextBlockDisplayMode",
            body: {
              sectionId,
              textDisplayMode: "Render",
              frontendOpId: null,
            },
          },
        ],
      });

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
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
      await expect.poll(() => setMasterFontSizeCallCount).toBe(1);

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
    await clearProjectChatWindows(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
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
      await createChildSectionsViaIncrementerFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        implType: "TextBlock",
        numChildren: 1,
      });

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
    await clearProjectChatWindows(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
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
      await createChildSectionsViaIncrementerFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        implType: "TextBlock",
        numChildren: 2,
      });

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
      await expect
        .poll(async () => await getSortableSectionDistances(page, childIds))
        .not.toBeNull();
      const kanbanDistances = await getSortableSectionDistances(page, childIds);
      expect(kanbanDistances).not.toBeNull();
      expect(
        (kanbanDistances?.xDelta ?? 0) > (kanbanDistances?.yDelta ?? 0),
      ).toBe(true);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".setta-gpu-flow__pane");
      const reloadedNode = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
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
      await expect
        .poll(async () => await getSortableSectionDistances(page, childIds))
        .not.toBeNull();
      const taskListDistances = await getSortableSectionDistances(
        page,
        childIds,
      );
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
    await clearProjectChatWindows(page);
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
      const root = await postBackend<RootResponse>(
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
        `.setta-gpu-flow__node[data-id="${taskBoardSectionId}"]`,
      );
      const spreadsheetNode = page.locator(
        `.setta-gpu-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.setta-gpu-flow__node[data-id="${browserSectionId}"]`,
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
      const firstListRowTaskInput = firstListRow
        .locator('input[type="text"]')
        .first();
      const [
        firstListRowBounds,
        dragHandleBounds,
        doneCheckboxBounds,
        taskInputBounds,
      ] = await Promise.all([
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
        firstTaskRow.locator(
          '[data-testid^="task-board-task-description-input-"]',
        ),
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
      await expect(
        taskBoardNode.getByTestId("task-board-add-task"),
      ).toHaveCount(0);
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
      const secondKanbanTitleInput = secondKanbanDragSurface
        .locator('input[type="text"]')
        .first();
      const [
        secondKanbanCardBounds,
        secondKanbanHandleBounds,
        secondKanbanTitleBounds,
      ] = await Promise.all([
        secondKanbanDragSurface.boundingBox(),
        secondKanbanDragHandle.boundingBox(),
        secondKanbanTitleInput.boundingBox(),
      ]);
      if (!secondKanbanCardBounds) {
        throw new Error("Second kanban task bounds unavailable.");
      }
      if (!secondKanbanHandleBounds) {
        throw new Error("Second kanban drag handle bounds unavailable.");
      }
      if (!secondKanbanTitleBounds) {
        throw new Error("Second kanban title input bounds unavailable.");
      }
      expect(secondKanbanHandleBounds.width).toBeGreaterThanOrEqual(26);
      expect(
        secondKanbanHandleBounds.x - secondKanbanCardBounds.x,
      ).toBeLessThan(12);
      const kanbanHandleCenterY =
        secondKanbanHandleBounds.y + secondKanbanHandleBounds.height / 2;
      const kanbanTitleCenterY =
        secondKanbanTitleBounds.y + secondKanbanTitleBounds.height / 2;
      expect(Math.abs(kanbanHandleCenterY - kanbanTitleCenterY)).toBeLessThan(
        5,
      );
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
      expect(firstLaneTaskTitles).toEqual([
        "schedule followup",
        "ship task board",
      ]);
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
      const taskRowsBeforeDelete = taskBoardNode.locator(
        "[data-task-board-task-id]",
      );
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
      await applyProjectMutationsFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        operations: [
          {
            operationName: "setSpreadsheetFilePath",
            body: {
              sectionId: spreadsheetSectionId,
              filePath: csvPath,
              activeSheet: null,
              frontendOpId: null,
            },
          },
        ],
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
      await expect(
        spreadsheetNode.getByTestId("spreadsheet-save"),
      ).toBeEnabled();
    } finally {
      page.off("request", handleSetTopLevelLayoutRequest);
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
