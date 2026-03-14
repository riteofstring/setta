import { CollisionType } from "@dnd-kit/abstract";
import { Draggable, Droppable } from "@dnd-kit/dom";
import { type DragEndEvent, type SettaCollision } from "forks/dnd-kit/adapter";
import { describe, expect, it } from "vitest";
import {
  buildDefaultThreadGroupName,
  buildNextThreadOrder,
  getGroupIdFromThreadSectionDropTargetId,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  normalizeUniqueThreadIds,
  parseThreadDropTargetId,
  PINNED_THREAD_DOMAIN,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  toThreadDndId,
  toThreadDropTargetId,
  toThreadGroupDndId,
  toThreadSectionDropTargetId,
  UNPINNED_THREAD_DOMAIN,
} from "./projectChatHistoryDragUtils";

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

describe("projectChatHistoryDragUtils", () => {
  it("normalizes thread ids and finds the next default group name", () => {
    // The extracted utility should keep storage order clean and suggest the first unused label.
    expect(
      normalizeUniqueThreadIds([
        " thread-1 ",
        "thread-1",
        "",
        "thread-2",
        "  thread-2  ",
      ]),
    ).toEqual(["thread-1", "thread-2"]);
    expect(
      buildDefaultThreadGroupName(["New Group", "new group 2", "Archive"]),
    ).toBe("New Group 3");
  });

  it("round-trips thread, group, and drop-target ids", () => {
    const groupIdSet = new Set(["group-a"]);

    // Each DnD identifier needs a lossless codec so drag surfaces can stay declarative.
    expect(getThreadIdFromDndId(toThreadDndId("thread-1"))).toBe("thread-1");
    expect(
      getThreadGroupIdFromDndId(toThreadGroupDndId("group-a"), groupIdSet),
    ).toBe("group-a");
    expect(
      parseThreadDropTargetId(
        toThreadDropTargetId(null, PINNED_THREAD_DOMAIN),
        groupIdSet,
      ),
    ).toEqual({
      groupId: null,
      pinDomain: PINNED_THREAD_DOMAIN,
    });
    expect(
      parseThreadDropTargetId(
        toThreadDropTargetId("group-a", UNPINNED_THREAD_DOMAIN),
        groupIdSet,
      ),
    ).toEqual({
      groupId: "group-a",
      pinDomain: UNPINNED_THREAD_DOMAIN,
    });
    expect(
      getGroupIdFromThreadSectionDropTargetId(
        toThreadSectionDropTargetId("group-a"),
        groupIdSet,
      ),
    ).toBe("group-a");
  });

  it("inserts a moved thread after the last matching group member when there is no target thread", () => {
    const threadGroupById = new Map<string, string | null>([
      ["thread-1", null],
      ["thread-2", "group-b"],
      ["thread-3", "group-b"],
      ["thread-4", "group-b"],
    ]);
    const threadPinnedById = new Map<string, boolean>([
      ["thread-1", false],
      ["thread-2", false],
      ["thread-3", true],
      ["thread-4", false],
    ]);

    // Group drops without a concrete sibling should append within the matching pin/group partition.
    const nextOrder = buildNextThreadOrder({
      sourceThreadId: "thread-4",
      targetThreadId: null,
      targetGroupId: "group-b",
      placement: "after",
      sourceThreadPinned: false,
      preferredOrder: ["thread-4", "thread-1", "thread-2", "thread-3"],
      fallbackOrder: ["thread-1", "thread-2", "thread-3", "thread-4"],
      threadGroupById,
      threadPinnedById,
    });

    expect(nextOrder).toEqual(["thread-1", "thread-2", "thread-4", "thread-3"]);
  });

  it("keeps group order unchanged when the drag does not clear the release threshold", () => {
    // Tiny pointer jitter should not persist a reordered group list.
    const nextOrder = resolveNextGroupOrderFromDrag({
      event: createDragEndEvent({
        activeId: toThreadGroupDndId("group-a"),
        overId: toThreadGroupDndId("group-b"),
        deltaX: 1,
        deltaY: 2,
      }),
      sourceGroupId: "group-a",
      orderedGroupIds: ["group-a", "group-b", "group-c"],
      groupIdSet: new Set(["group-a", "group-b", "group-c"]),
    });

    expect(nextOrder).toBeNull();
  });

  it("reorders groups when the drag crosses the threshold onto another group section", () => {
    // A section drop target should resolve back to the owning group and reorder accordingly.
    const nextOrder = resolveNextGroupOrderFromDrag({
      event: createDragEndEvent({
        activeId: toThreadGroupDndId("group-a"),
        overId: toThreadSectionDropTargetId("group-c"),
        deltaY: 24,
      }),
      sourceGroupId: "group-a",
      orderedGroupIds: ["group-a", "group-b", "group-c"],
      groupIdSet: new Set(["group-a", "group-b", "group-c"]),
    });

    expect(nextOrder).toEqual(["group-b", "group-c", "group-a"]);
  });

  it("returns a same-domain thread drop target with placement awareness", () => {
    const threadGroupById = new Map<string, string | null>([
      ["thread-1", "group-a"],
      ["thread-2", "group-a"],
    ]);
    const threadPinnedById = new Map<string, boolean>([
      ["thread-1", false],
      ["thread-2", false],
    ]);

    // Thread-over-thread drops should preserve before/after placement when the pin domain matches.
    const dropTarget = resolveThreadDropTarget({
      event: createDragEndEvent({
        activeId: toThreadDndId("thread-1"),
        overId: toThreadDndId("thread-2"),
        deltaY: -10,
        collisions: [
          {
            id: toThreadDndId("thread-2"),
            pastHalfway: false,
          },
        ],
      }),
      sourceThreadId: "thread-1",
      groupIdSet: new Set(["group-a"]),
      threadGroupById,
      threadPinnedById,
    });

    expect(dropTarget).toEqual({
      groupId: "group-a",
      targetThreadId: "thread-2",
      placement: "before",
      pinDomain: UNPINNED_THREAD_DOMAIN,
    });
  });

  it("rejects drops onto threads from another pin domain", () => {
    const threadGroupById = new Map<string, string | null>([
      ["thread-1", "group-a"],
      ["thread-2", "group-a"],
    ]);
    const threadPinnedById = new Map<string, boolean>([
      ["thread-1", false],
      ["thread-2", true],
    ]);

    // Pinned and unpinned thread domains are intentionally isolated.
    const dropTarget = resolveThreadDropTarget({
      event: createDragEndEvent({
        activeId: toThreadDndId("thread-1"),
        overId: toThreadDndId("thread-2"),
        deltaY: 12,
      }),
      sourceThreadId: "thread-1",
      groupIdSet: new Set(["group-a"]),
      threadGroupById,
      threadPinnedById,
    });

    expect(dropTarget).toBeNull();
  });
});
