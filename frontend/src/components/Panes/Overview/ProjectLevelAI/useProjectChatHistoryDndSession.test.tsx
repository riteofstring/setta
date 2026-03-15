/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import type {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("state/actions/projectChatThreadGroupAssignments", () => ({
  setProjectChatThreadGroupAssignment: vi.fn(),
}));

vi.mock("state/actions/projectChatThreadGroupOrdering", () => ({
  reorderProjectChatThreadGroups: vi.fn(),
}));

vi.mock("state/actions/projectChatThreadMutations", () => ({
  reorderProjectChatThreads: vi.fn(),
}));

vi.mock("./projectChatHistoryDnd", async () => {
  const actual = await vi.importActual<
    typeof import("./projectChatHistoryDnd")
  >("./projectChatHistoryDnd");
  return {
    ...actual,
    buildNextThreadOrder: vi.fn(),
    getGroupIdFromThreadSectionDropTargetId: vi.fn(),
    getPointerClientPoint: vi.fn(),
    getThreadGroupIdFromDndId: vi.fn(),
    getThreadIdFromDndId: vi.fn(),
    isPointerWithinThreadGroupDomain: vi.fn(),
    resolveGroupIdFromPointerPosition: vi.fn(),
    resolveNextGroupOrderFromDrag: vi.fn(),
    resolveThreadDropTarget: vi.fn(),
  };
});

import { setProjectChatThreadGroupAssignment } from "state/actions/projectChatThreadGroupAssignments";
import { reorderProjectChatThreadGroups } from "state/actions/projectChatThreadGroupOrdering";
import { reorderProjectChatThreads } from "state/actions/projectChatThreadMutations";
import {
  buildNextThreadOrder,
  getGroupIdFromThreadSectionDropTargetId,
  getPointerClientPoint,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  isPointerWithinThreadGroupDomain,
  resolveGroupIdFromPointerPosition,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  toThreadDndId,
  toThreadGroupDndId,
} from "./projectChatHistoryDnd";
import {
  UNPINNED_THREAD_DOMAIN,
  type ThreadGroupSection,
} from "./projectChatHistoryViewModel";

type UseProjectChatHistoryDndSessionType =
  typeof import("./useProjectChatHistoryDndSession").useProjectChatHistoryDndSession;

let useProjectChatHistoryDndSession: UseProjectChatHistoryDndSessionType;

type DndSessionHarnessProps = {
  groupSections?: Array<ThreadGroupSection>;
  onSelectedGroupChange?: (groupId: string | null) => void;
  pinnedSortableGroupIds?: Array<string>;
  pinnedThreadIdsSet?: Set<string>;
  threadGroupById?: Map<string, string | null>;
  threadOrderIds?: Array<string>;
  threadPinnedById?: Map<string, boolean>;
  unpinnedSortableGroupIds?: Array<string>;
};

function buildGroupSection(
  overrides: Partial<ThreadGroupSection> = {},
): ThreadGroupSection {
  return {
    id: "group-a",
    name: "Group A",
    collapsed: false,
    pinned: false,
    entries: [],
    ...overrides,
  };
}

function buildDragStartEvent(activeId: string): DragStartEvent {
  return {
    active: { id: activeId },
    activeRect: null,
  };
}

function buildDragMoveEvent(activeId: string): DragMoveEvent {
  return {
    active: { id: activeId },
    activatorEvent: {
      clientX: 20,
      clientY: 40,
    } as Event,
    collisions: [],
    delta: { x: 0, y: 22 },
    over: null,
  };
}

function buildDragEndEvent({
  activeId,
  overId = null,
}: {
  activeId: string;
  overId?: string | null;
}): DragEndEvent {
  return {
    active: { id: activeId },
    activatorEvent: null,
    collisions: [],
    delta: { x: 0, y: 22 },
    over: overId ? { id: overId } : null,
  };
}

function DndSessionHarness({
  groupSections = [
    buildGroupSection({ id: "group-a" }),
    buildGroupSection({ id: "group-b" }),
  ],
  onSelectedGroupChange,
  pinnedSortableGroupIds = [],
  pinnedThreadIdsSet = new Set<string>(),
  threadGroupById = new Map([
    ["thread-a", "group-a"],
    ["thread-b", "group-a"],
  ]),
  threadOrderIds = ["thread-a", "thread-b"],
  threadPinnedById = new Map([
    ["thread-a", false],
    ["thread-b", false],
  ]),
  unpinnedSortableGroupIds = ["group-a", "group-b"],
}: DndSessionHarnessProps) {
  const session = useProjectChatHistoryDndSession({
    groupIdSet: new Set(groupSections.map((section) => section.id)),
    groupSections,
    groupsSortableEnabled: true,
    onSelectedGroupChange,
    orderedVisibleThreadIds: ["thread-a", "thread-b"],
    pinnedSortableGroupIds,
    pinnedThreadIdsSet,
    projectConfigId: "project-1",
    threadGroupById,
    threadOrderIds,
    threadPinnedById,
    threadsSortableEnabled: true,
    unpinnedSortableGroupIds,
  });

  return (
    <div>
      <output data-testid="active-thread-drag-id">
        {session.activeThreadDragId ?? ""}
      </output>
      <output data-testid="thread-drag-hover-group-id">
        {session.threadDragHoverGroupId ?? ""}
      </output>
      <button
        type="button"
        data-testid="start-thread-drag"
        onClick={() => {
          session.handleDragStart(
            buildDragStartEvent(toThreadDndId("thread-a")),
          );
        }}
      >
        Start thread drag
      </button>
      <button
        type="button"
        data-testid="move-thread-drag"
        onClick={() => {
          session.handleDragMove(buildDragMoveEvent(toThreadDndId("thread-a")));
        }}
      >
        Move thread drag
      </button>
      <button
        type="button"
        data-testid="end-thread-drag"
        onClick={() => {
          session.handleDragEnd(
            buildDragEndEvent({
              activeId: toThreadDndId("thread-a"),
              overId: toThreadDndId("thread-b"),
            }),
          );
        }}
      >
        End thread drag
      </button>
      <button
        type="button"
        data-testid="end-group-drag"
        onClick={() => {
          session.handleDragEnd(
            buildDragEndEvent({
              activeId: toThreadGroupDndId("group-a"),
              overId: toThreadGroupDndId("group-b"),
            }),
          );
        }}
      >
        End group drag
      </button>
      <button
        type="button"
        data-testid="cancel-drag"
        onClick={session.handleDragCancel}
      >
        Cancel drag
      </button>
    </div>
  );
}

describe("useProjectChatHistoryDndSession", () => {
  let host: HTMLDivElement;
  let root: Root;

  function getByTestId(testId: string): HTMLElement {
    const element = host.querySelector(`[data-testid="${testId}"]`);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Missing element for test id: ${testId}`);
    }
    return element;
  }

  function clickByTestId(testId: string): void {
    getByTestId(testId).click();
  }

  beforeAll(async () => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    ({ useProjectChatHistoryDndSession } = await import(
      "./useProjectChatHistoryDndSession"
    ));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    vi.mocked(getPointerClientPoint).mockReturnValue({ x: 20, y: 40 });
    vi.mocked(resolveGroupIdFromPointerPosition).mockReturnValue("group-a");
    vi.mocked(getThreadIdFromDndId).mockImplementation((dndId) => {
      if (dndId === toThreadDndId("thread-a")) {
        return "thread-a";
      }
      if (dndId === toThreadDndId("thread-b")) {
        return "thread-b";
      }
      return null;
    });
    vi.mocked(getThreadGroupIdFromDndId).mockImplementation((dndId) => {
      if (dndId === toThreadGroupDndId("group-a")) {
        return "group-a";
      }
      if (dndId === toThreadGroupDndId("group-b")) {
        return "group-b";
      }
      return null;
    });
    vi.mocked(getGroupIdFromThreadSectionDropTargetId).mockReturnValue(
      undefined,
    );
    vi.mocked(isPointerWithinThreadGroupDomain).mockReturnValue(true);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("tracks the active thread drag id and clears the drag session on cancel", async () => {
    await act(async () => {
      root.render(<DndSessionHarness />);
    });

    await act(async () => {
      clickByTestId("start-thread-drag");
    });

    // The extracted session owns the visible drag state that the panel renders.
    expect(getByTestId("active-thread-drag-id").textContent).toBe("thread-a");
    expect(getByTestId("thread-drag-hover-group-id").textContent).toBe(
      "group-a",
    );

    await act(async () => {
      clickByTestId("cancel-drag");
    });

    // Cancelling a drag should always leave the coordinator with a clean slate.
    expect(getByTestId("active-thread-drag-id").textContent).toBe("");
    expect(getByTestId("thread-drag-hover-group-id").textContent).toBe("");
  });

  it("applies a thread move and notifies the selected group when a drop resolves", async () => {
    const onSelectedGroupChange = vi.fn();

    vi.mocked(resolveThreadDropTarget).mockReturnValue({
      groupId: "group-a",
      targetThreadId: "thread-b",
      placement: "after",
      pinDomain: UNPINNED_THREAD_DOMAIN,
    });
    vi.mocked(buildNextThreadOrder).mockReturnValue(["thread-b", "thread-a"]);

    await act(async () => {
      root.render(
        <DndSessionHarness onSelectedGroupChange={onSelectedGroupChange} />,
      );
    });

    await act(async () => {
      clickByTestId("start-thread-drag");
      clickByTestId("move-thread-drag");
      clickByTestId("end-thread-drag");
    });

    // Thread drops should still mutate ordering and group selection through the extracted owner.
    expect(setProjectChatThreadGroupAssignment).toHaveBeenCalledWith(
      "project-1",
      "thread-a",
      "group-a",
    );
    expect(reorderProjectChatThreads).toHaveBeenCalledWith("project-1", [
      "thread-b",
      "thread-a",
    ]);
    expect(onSelectedGroupChange).toHaveBeenCalledWith("group-a");
    expect(getByTestId("active-thread-drag-id").textContent).toBe("");
  });

  it("reorders thread groups within the same pin domain", async () => {
    vi.mocked(resolveGroupIdFromPointerPosition).mockReturnValue(null);
    vi.mocked(resolveNextGroupOrderFromDrag).mockReturnValue([
      "group-b",
      "group-a",
    ]);

    await act(async () => {
      root.render(<DndSessionHarness />);
    });

    await act(async () => {
      clickByTestId("end-group-drag");
    });

    // Group drag completion stays in the drag-session owner and preserves pinned/unpinned scoping.
    expect(reorderProjectChatThreadGroups).toHaveBeenCalledWith("project-1", [
      "group-b",
      "group-a",
    ]);
    expect(setProjectChatThreadGroupAssignment).not.toHaveBeenCalled();
  });
});
