/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserver,
  });
});

import { CollisionType } from "@dnd-kit/abstract";
import { Draggable, Droppable } from "@dnd-kit/dom";
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type SettaCollision,
} from "forks/dnd-kit/adapter";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  toThreadDndId,
  toThreadGroupDndId,
  UNPINNED_THREAD_DOMAIN,
  type ThreadDropTarget,
} from "./projectChatHistoryDragUtils";
import { type ThreadGroupSection } from "./projectChatHistoryViewModel";
import { useProjectChatHistoryDragController } from "./useProjectChatHistoryDragController";

function createCollision({
  id,
  pastHalfway,
}: {
  id: string;
  pastHalfway?: boolean;
}): SettaCollision {
  return {
    id,
    priority: 1,
    type: CollisionType.PointerIntersection,
    value: 1,
    pastHalfway,
  };
}

function createDragStartEvent({
  activeId,
  clientX = 0,
  clientY = 0,
}: {
  activeId: string;
  clientX?: number;
  clientY?: number;
}): DragStartEvent {
  return {
    activatorEvent: new MouseEvent("pointerdown", {
      clientX,
      clientY,
    }),
    active: new Draggable({ id: activeId }, undefined),
  };
}

function createDragMoveEvent({
  activeId,
  overId,
  deltaX = 0,
  deltaY = 0,
  collisions = [],
}: {
  activeId: string;
  overId: string | null;
  deltaX?: number;
  deltaY?: number;
  collisions?: Array<{ id: string; pastHalfway?: boolean }>;
}): DragMoveEvent {
  return {
    activatorEvent: null,
    active: new Draggable({ id: activeId }, undefined),
    collisions: collisions.length > 0 ? collisions.map(createCollision) : null,
    delta: {
      x: deltaX,
      y: deltaY,
    },
    over: overId ? new Droppable({ id: overId }, undefined) : null,
  };
}

function createDragEndEvent({
  activeId,
  overId,
  deltaX = 0,
  deltaY = 0,
  collisions = [],
}: {
  activeId: string;
  overId: string | null;
  deltaX?: number;
  deltaY?: number;
  collisions?: Array<{ id: string; pastHalfway?: boolean }>;
}): DragEndEvent {
  return {
    activatorEvent: null,
    active: new Draggable({ id: activeId }, undefined),
    collisions: collisions.length > 0 ? collisions.map(createCollision) : null,
    delta: {
      x: deltaX,
      y: deltaY,
    },
    over: overId ? new Droppable({ id: overId }, undefined) : null,
  };
}

function createThreadGroupSection(
  groupId: string,
  pinned = false,
): ThreadGroupSection {
  return {
    id: groupId,
    name: groupId,
    collapsed: false,
    pinned,
    entries: [],
  };
}

type DragControllerHarnessProps = Parameters<
  typeof useProjectChatHistoryDragController
>[0];

let latestController: ReturnType<
  typeof useProjectChatHistoryDragController
> | null = null;

function DragControllerHarness(props: DragControllerHarnessProps) {
  latestController = useProjectChatHistoryDragController(props);
  return null;
}

describe("useProjectChatHistoryDragController", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    latestController = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    latestController = null;
    vi.restoreAllMocks();
  });

  it("owns thread drag hover state and resolves pointer-target moves through the injected callback", async () => {
    const moveCalls: Array<{ threadId: string; dropTarget: ThreadDropTarget }> =
      [];
    const groupRowA = document.createElement("div");
    groupRowA.setAttribute("data-testid", "project-chat-thread-group-row");
    groupRowA.setAttribute("data-group-id", "group-a");
    const groupRowB = document.createElement("div");
    groupRowB.setAttribute("data-testid", "project-chat-thread-group-row");
    groupRowB.setAttribute("data-group-id", "group-b");
    document.body.append(groupRowA, groupRowB);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn((x: number, y: number) => {
        if (x < 0 || y < 0) {
          return [];
        }
        return y >= 100 ? [groupRowB] : [groupRowA];
      }),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn((x: number, y: number) => {
        return y >= 100 ? groupRowB : groupRowA;
      }),
    });

    await act(async () => {
      root.render(
        <DragControllerHarness
          groupSections={[
            createThreadGroupSection("group-a"),
            createThreadGroupSection("group-b"),
          ]}
          pinnedSortableGroupIds={[]}
          unpinnedSortableGroupIds={["group-a", "group-b"]}
          groupsSortableEnabled={false}
          threadsSortableEnabled={true}
          pinnedThreadIdsSet={new Set()}
          threadGroupById={
            new Map([
              ["thread-1", "group-a"],
              ["thread-2", "group-b"],
            ])
          }
          threadPinnedById={
            new Map([
              ["thread-1", false],
              ["thread-2", false],
            ])
          }
          onMoveThread={(threadId, dropTarget) => {
            moveCalls.push({ threadId, dropTarget });
          }}
          onReorderGroups={() => {
            throw new Error("Should not reorder groups for a thread drag.");
          }}
        />,
      );
    });

    if (!latestController) {
      throw new Error("Expected a drag controller.");
    }

    expect(latestController.threadDndSensors).toHaveLength(1);

    await act(async () => {
      latestController?.handleDragStart(
        createDragStartEvent({
          activeId: toThreadDndId("thread-1"),
          clientX: 12,
          clientY: 12,
        }),
      );
    });
    expect(latestController.activeThreadDragId).toBe("thread-1");
    expect(latestController.threadDragHoverGroupId).toBe("group-a");

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          clientX: 14,
          clientY: 140,
          bubbles: true,
        }),
      );
      latestController?.handleDragMove(
        createDragMoveEvent({
          activeId: toThreadDndId("thread-1"),
          overId: null,
          deltaY: 128,
        }),
      );
    });
    expect(latestController.threadDragHoverGroupId).toBe("group-b");

    await act(async () => {
      latestController?.handleDragEnd(
        createDragEndEvent({
          activeId: toThreadDndId("thread-1"),
          overId: null,
          deltaY: 128,
        }),
      );
    });

    // The extracted controller should keep the pointer-based fallback move resolution out of the surface.
    expect(latestController.activeThreadDragId).toBeNull();
    expect(latestController.threadDragHoverGroupId).toBeNull();
    expect(moveCalls).toEqual([
      {
        threadId: "thread-1",
        dropTarget: {
          groupId: "group-b",
          targetThreadId: null,
          placement: "after",
          pinDomain: UNPINNED_THREAD_DOMAIN,
        },
      },
    ]);
  });

  it("owns group reorder drag resolution and delegates the reordered ids through the injected callback", async () => {
    const reorderCalls: Array<Array<string>> = [];
    const unpinnedDomain = document.createElement("div");
    unpinnedDomain.setAttribute("data-thread-group-domain", "unpinned");
    unpinnedDomain.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      toJSON: () => ({}),
    }));
    document.body.appendChild(unpinnedDomain);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => []),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => null),
    });

    await act(async () => {
      root.render(
        <DragControllerHarness
          groupSections={[
            createThreadGroupSection("group-a"),
            createThreadGroupSection("group-b"),
            createThreadGroupSection("group-c"),
          ]}
          pinnedSortableGroupIds={[]}
          unpinnedSortableGroupIds={["group-a", "group-b", "group-c"]}
          groupsSortableEnabled={true}
          threadsSortableEnabled={false}
          pinnedThreadIdsSet={new Set(["thread-pinned"])}
          threadGroupById={new Map()}
          threadPinnedById={
            new Map([
              ["thread-pinned", true],
              ["thread-unpinned", false],
            ])
          }
          onMoveThread={() => {
            throw new Error("Should not move a thread for a group drag.");
          }}
          onReorderGroups={(nextOrderedGroupIds) => {
            reorderCalls.push(nextOrderedGroupIds);
          }}
        />,
      );
    });

    if (!latestController) {
      throw new Error("Expected a drag controller.");
    }

    expect(latestController.threadDndSensors).toHaveLength(1);
    expect(latestController.threadDndContext).toEqual({
      isMovingFree: false,
      isSorting: false,
    });

    await act(async () => {
      latestController?.handleDragStart(
        createDragStartEvent({
          activeId: toThreadGroupDndId("group-a"),
          clientX: 10,
          clientY: 10,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          clientX: 10,
          clientY: 150,
          bubbles: true,
        }),
      );
    });

    await act(async () => {
      latestController?.handleDragEnd(
        createDragEndEvent({
          activeId: toThreadGroupDndId("group-a"),
          overId: toThreadGroupDndId("group-c"),
          deltaY: 48,
          collisions: [
            {
              id: toThreadGroupDndId("group-c"),
            },
          ],
        }),
      );
    });

    // Group reorders should stay in the same pin domain and publish the new persisted order once.
    expect(reorderCalls).toEqual([["group-b", "group-c", "group-a"]]);
  });
});
