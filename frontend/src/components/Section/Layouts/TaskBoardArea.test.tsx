/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createSingletonSections,
  createTaskBoardColumn,
  createTaskBoardSectionImpl,
  createTaskBoardTask,
  createVariant,
  TaskBoardTaskRecurrenceEnum,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoardArea } from "./TaskBoardArea";

vi.mock("@dnd-kit/dom", () => ({
  KeyboardSensor: {
    configure: vi.fn(() => ({ type: "keyboard" })),
  },
  PointerActivationConstraints: {
    Distance: class {
      value: number;

      constructor({ value }: { value: number }) {
        this.value = value;
      }
    },
  },
  PointerSensor: {
    configure: vi.fn(() => ({ type: "pointer" })),
  },
}));

vi.mock("forks/dnd-kit/adapter", () => ({
  DragDropProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="task-board-dnd-provider">{children}</div>
  ),
  SortableContext: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: vi.fn(),
  }),
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    isOver: false,
    listeners: {},
    setActivatorNodeRef: vi.fn(),
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock("forks/dnd-kit/DragOperationShapeSync", () => ({
  DragOperationShapeSync: () => null,
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: true,
  }),
}));

const sectionId = "task-board-section";
const sectionVariantId = "task-board-variant";
const sectionImplId = "task-board-impl";
const todoColumnId = "todo";
const doneColumnId = "done";
const taskId = "task-one";

type RenderedTaskBoardArea = {
  host: HTMLDivElement;
  root: Root;
};

function setTaskBoardProjectState(viewMode: TaskBoardViewModeEnum) {
  useProjectState.setState({
    artifactGroups: {},
    codeObjImpls: {},
    codeObjVariants: {},
    codeObjs: {},
    parentSectionMap: { [sectionId]: null },
    previewSectionVariantMap: {},
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    }),
    requiredDecodedImages: [],
    sectionImpls: {
      [sectionImplId]: createTaskBoardSectionImpl({
        id: sectionImplId,
        columns: [
          createTaskBoardColumn({
            id: todoColumnId,
            name: "Todo",
            sortIndex: 0,
          }),
          createTaskBoardColumn({
            id: doneColumnId,
            name: "Done",
            sortIndex: 1,
          }),
        ],
        tasks: [
          createTaskBoardTask({
            id: taskId,
            columnId: todoColumnId,
            description: "Description",
            dueDateIso: "2026-04-30",
            recurrence: TaskBoardTaskRecurrenceEnum.none,
            sortIndex: 0,
            title: "Write tests",
          }),
        ],
        viewMode,
      }),
    },
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        defaultVariant: sectionVariantId,
        name: "Task Board",
        variants: [sectionVariantId],
      }),
    },
    sectionVariants: {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        impl: sectionImplId,
        name: "Default",
        nonPresetImpls: [sectionImplId],
      }),
    },
    shownParamIds: {},
    singletonSections: createSingletonSections(),
  } as ZustandProjectState);
}

async function renderTaskBoardArea(
  viewMode: TaskBoardViewModeEnum,
): Promise<RenderedTaskBoardArea> {
  setTaskBoardProjectState(viewMode);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<TaskBoardArea sectionId={sectionId} />);
  });

  return { host, root };
}

async function unmountTaskBoardArea({ host, root }: RenderedTaskBoardArea) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

function getGpuControl(host: ParentNode, controlId: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(
    `[data-gpu-flow-control="task-board:${controlId}"]`,
  );
  if (!element) {
    throw new Error(`Missing task board GPU control ${controlId}`);
  }
  return element;
}

function expectGpuControl(element: HTMLElement) {
  expect(element.getAttribute("data-gpu-flow-interactive")).toBe("true");
  expect(element.classList.contains("nodrag")).toBe(true);
  expect(element.classList.contains("nopan")).toBe(true);
}

function expectTaskBoardControl(element: HTMLElement) {
  expectGpuControl(element);
  expect(element.classList.contains("task-board-no-drag")).toBe(true);
}

function expectDndOwnedSurface(element: HTMLElement) {
  expectGpuControl(element);
  expect(element.classList.contains("task-board-no-drag")).toBe(false);
}

describe("TaskBoardArea GPU flow ownership", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("marks task-list controls as stable GPU handoff targets without blocking task dnd handles", async () => {
    const rendered = await renderTaskBoardArea(TaskBoardViewModeEnum.task_list);

    try {
      expectGpuControl(getGpuControl(rendered.host, `${sectionId}:surface`));
      expectTaskBoardControl(
        getGpuControl(rendered.host, `${sectionId}:new-task-title`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `${sectionId}:add-task`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `${sectionId}:add-column`),
      );
      expect(
        getGpuControl(
          rendered.host,
          `${sectionId}:task-list-scroll`,
        ).classList.contains("nowheel"),
      ).toBe(true);

      expectDndOwnedSurface(
        getGpuControl(rendered.host, `task:${taskId}:list-row`),
      );
      expectDndOwnedSurface(
        getGpuControl(rendered.host, `task:${taskId}:drag-handle`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:done`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:title`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:column`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:schedule-menu`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:description-toggle`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:description`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:remove`),
      );
    } finally {
      await unmountTaskBoardArea(rendered);
    }
  });

  it("marks kanban controls as stable GPU handoff targets without blocking task dnd handles", async () => {
    const rendered = await renderTaskBoardArea(TaskBoardViewModeEnum.kanban);

    try {
      expect(
        getGpuControl(
          rendered.host,
          `${sectionId}:kanban-scroll`,
        ).classList.contains("nowheel"),
      ).toBe(true);
      expectDndOwnedSurface(
        getGpuControl(rendered.host, `column:${todoColumnId}:lane`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `column:${todoColumnId}:color`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `column:${todoColumnId}:name`),
      );
      expect(
        getGpuControl(
          rendered.host,
          `column:${todoColumnId}:tasks`,
        ).classList.contains("nowheel"),
      ).toBe(true);
      expectTaskBoardControl(
        getGpuControl(rendered.host, `column:${todoColumnId}:add-task`),
      );

      expectDndOwnedSurface(
        getGpuControl(rendered.host, `task:${taskId}:kanban-card`),
      );
      expectDndOwnedSurface(
        getGpuControl(rendered.host, `task:${taskId}:drag-handle`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:title`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:schedule-menu`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:description-toggle`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:description`),
      );
      expectTaskBoardControl(
        getGpuControl(rendered.host, `task:${taskId}:remove`),
      );
    } finally {
      await unmountTaskBoardArea(rendered);
    }
  });
});
