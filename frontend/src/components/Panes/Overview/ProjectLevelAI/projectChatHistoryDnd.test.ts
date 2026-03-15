// @vitest-environment jsdom

import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import type { DragEndEvent, SettaCollision } from "forks/dnd-kit/adapter";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildNextThreadOrder,
  getGroupIdFromThreadSectionDropTargetId,
  getPointerClientPoint,
  getThreadGroupIdFromDndId,
  getThreadIdFromDndId,
  isPointerWithinThreadGroupDomain,
  parseThreadDropTargetId,
  PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX,
  resolveGroupIdFromPointerPosition,
  resolveNextGroupOrderFromDrag,
  resolveThreadDropTarget,
  toThreadDndId,
  toThreadDropTargetId,
  toThreadGroupDndId,
  toThreadSectionDropTargetId,
} from "./projectChatHistoryDnd";
import {
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
} from "./projectChatHistoryViewModel";

function buildCollision({
  id,
  pastHalfway,
  intersectionRatio = 1,
}: {
  id: string;
  pastHalfway?: boolean;
  intersectionRatio?: number;
}): SettaCollision {
  return {
    id,
    pastHalfway,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: intersectionRatio,
    data: {
      intersectionRatio,
    },
  };
}

function buildDragEndEvent({
  activeId = "active-thread",
  collisions = null,
  delta = { x: 0, y: 0 },
  overId = null,
}: {
  activeId?: string;
  collisions?: Array<SettaCollision> | null;
  delta?: { x: number; y: number };
  overId?: string | null;
}): DragEndEvent {
  return {
    activatorEvent: null,
    active: { id: activeId } as DragEndEvent["active"],
    collisions,
    delta,
    over: overId ? ({ id: overId } as DragEndEvent["over"]) : null,
  };
}

function installPointResolvers({
  elements = [],
  fallback = null,
}: {
  elements?: Array<Element>;
  fallback?: Element | null;
}): () => void {
  const originalElementsFromPoint = document.elementsFromPoint;
  const originalElementFromPoint = document.elementFromPoint;

  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => elements,
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => fallback,
  });

  return () => {
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: originalElementsFromPoint,
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  };
}

describe("projectChatHistoryDnd", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("parses thread, group, and section drop identifiers only for known groups", () => {
    const groupIdSet = new Set(["group-a"]);

    // Keeps DnD ids deterministic and rejects stale group references.
    expect(getThreadIdFromDndId(toThreadDndId("chat-a"))).toBe("chat-a");
    expect(
      getThreadGroupIdFromDndId(toThreadGroupDndId("group-a"), groupIdSet),
    ).toBe("group-a");
    expect(
      parseThreadDropTargetId(
        toThreadDropTargetId("group-a", PINNED_THREAD_DOMAIN),
        groupIdSet,
      ),
    ).toEqual({
      groupId: "group-a",
      pinDomain: PINNED_THREAD_DOMAIN,
    });
    expect(
      getGroupIdFromThreadSectionDropTargetId(
        toThreadSectionDropTargetId("group-a"),
        groupIdSet,
      ),
    ).toBe("group-a");
    expect(
      parseThreadDropTargetId(
        toThreadDropTargetId("group-missing", PINNED_THREAD_DOMAIN),
        groupIdSet,
      ),
    ).toBeUndefined();
  });

  it("resolves an in-domain thread drop before the hovered thread from collision state", () => {
    const event = buildDragEndEvent({
      collisions: [
        buildCollision({ id: toThreadDndId("chat-b"), pastHalfway: false }),
      ],
      delta: { x: 0, y: -18 },
      overId: toThreadDndId("chat-b"),
    });

    // Keeps thread-to-thread placement aligned with sortable past-halfway state.
    expect(
      resolveThreadDropTarget({
        event,
        sourceThreadId: "chat-a",
        groupIdSet: new Set(["group-a"]),
        threadGroupById: new Map([
          ["chat-a", "group-a"],
          ["chat-b", "group-a"],
        ]),
        threadPinnedById: new Map([
          ["chat-a", true],
          ["chat-b", true],
        ]),
      }),
    ).toEqual({
      groupId: "group-a",
      targetThreadId: "chat-b",
      placement: "before",
      pinDomain: PINNED_THREAD_DOMAIN,
    });
  });

  it("rejects thread drops when the hovered drop zone belongs to the opposite pin domain", () => {
    const event = buildDragEndEvent({
      collisions: [
        buildCollision({
          id: toThreadDropTargetId("group-a", UNPINNED_THREAD_DOMAIN),
        }),
      ],
      delta: { x: 0, y: 20 },
      overId: toThreadDropTargetId("group-a", UNPINNED_THREAD_DOMAIN),
    });

    // Prevents pinned and unpinned histories from cross-contaminating during drag.
    expect(
      resolveThreadDropTarget({
        event,
        sourceThreadId: "chat-a",
        groupIdSet: new Set(["group-a"]),
        threadGroupById: new Map([["chat-a", "group-a"]]),
        threadPinnedById: new Map([["chat-a", true]]),
      }),
    ).toBeNull();
  });

  it("moves a group only after the pointer clears the release threshold", () => {
    const groupIdSet = new Set(["group-a", "group-b", "group-c"]);

    // Ignores taps and tiny drifts, but commits real reorder gestures.
    expect(
      resolveNextGroupOrderFromDrag({
        event: buildDragEndEvent({
          collisions: [buildCollision({ id: toThreadGroupDndId("group-b") })],
          delta: {
            x: PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX,
            y: PROJECT_CHAT_HISTORY_DRAG_RELEASE_THRESHOLD_PX,
          },
          overId: toThreadGroupDndId("group-b"),
        }),
        groupIdSet,
        orderedGroupIds: ["group-a", "group-b", "group-c"],
        sourceGroupId: "group-a",
      }),
    ).toBeNull();
    expect(
      resolveNextGroupOrderFromDrag({
        event: buildDragEndEvent({
          collisions: [buildCollision({ id: toThreadGroupDndId("group-b") })],
          delta: { x: 1, y: 16 },
          overId: toThreadGroupDndId("group-b"),
        }),
        groupIdSet,
        orderedGroupIds: ["group-a", "group-b", "group-c"],
        sourceGroupId: "group-a",
      }),
    ).toEqual(["group-b", "group-a", "group-c"]);
  });

  it("resolves group rows and domain bounds from live pointer coordinates", () => {
    const domain = document.createElement("section");
    domain.setAttribute("data-thread-group-domain", PINNED_THREAD_DOMAIN);
    Object.defineProperty(domain, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: 10,
        left: 20,
        bottom: 110,
        right: 220,
        width: 200,
        height: 100,
      }),
    });

    const groupRow = document.createElement("div");
    groupRow.setAttribute("data-testid", "project-chat-thread-group-row");
    groupRow.setAttribute("data-group-id", "group-a");
    domain.appendChild(groupRow);
    document.body.appendChild(domain);

    const restoreResolvers = installPointResolvers({
      elements: [groupRow],
      fallback: groupRow,
    });

    // Uses the same DOM markers as production to resolve hover group and pin domain.
    expect(
      resolveGroupIdFromPointerPosition({
        pointerCurrent: { x: 48, y: 56 },
        pointerStart: null,
        delta: { x: 0, y: 0 },
        groupIdSet: new Set(["group-a"]),
      }),
    ).toBe("group-a");
    expect(
      isPointerWithinThreadGroupDomain({
        pointerCurrent: { x: 48, y: 56 },
        pointerStart: null,
        delta: { x: 0, y: 0 },
        pinDomain: PINNED_THREAD_DOMAIN,
      }),
    ).toBe(true);

    restoreResolvers();
  });

  it("extracts pointer coordinates from drag activator events", () => {
    // Supports both pointer and touch activators without special casing callers.
    expect(
      getPointerClientPoint({
        clientX: 14,
        clientY: 28,
      } as Event),
    ).toEqual({ x: 14, y: 28 });
    expect(
      getPointerClientPoint({
        changedTouches: [{ clientX: 33, clientY: 44 }],
      } as unknown as Event),
    ).toEqual({ x: 33, y: 44 });
  });

  it("rebuilds thread order around the target thread and target group", () => {
    const threadGroupById = new Map<string, string | null>([
      ["chat-a", "group-a"],
      ["chat-b", "group-a"],
      ["chat-c", "group-b"],
      ["chat-d", "group-b"],
    ]);
    const threadPinnedById = new Map<string, boolean>([
      ["chat-a", true],
      ["chat-b", true],
      ["chat-c", true],
      ["chat-d", true],
    ]);

    // Inserts before an explicit target thread and otherwise falls back to the end of the target group.
    expect(
      buildNextThreadOrder({
        fallbackOrder: ["chat-a", "chat-b", "chat-c", "chat-d"],
        placement: "before",
        preferredOrder: ["chat-a", "chat-b", "chat-c", "chat-d"],
        sourceThreadId: "chat-d",
        sourceThreadPinned: true,
        targetGroupId: "group-a",
        targetThreadId: "chat-b",
        threadGroupById,
        threadPinnedById,
      }),
    ).toEqual(["chat-a", "chat-d", "chat-b", "chat-c"]);
    expect(
      buildNextThreadOrder({
        fallbackOrder: ["chat-a", "chat-b", "chat-c", "chat-d"],
        placement: "after",
        preferredOrder: ["chat-a", "chat-b", "chat-c", "chat-d"],
        sourceThreadId: "chat-a",
        sourceThreadPinned: true,
        targetGroupId: "group-b",
        targetThreadId: null,
        threadGroupById,
        threadPinnedById,
      }),
    ).toEqual(["chat-b", "chat-c", "chat-d", "chat-a"]);
  });
});
