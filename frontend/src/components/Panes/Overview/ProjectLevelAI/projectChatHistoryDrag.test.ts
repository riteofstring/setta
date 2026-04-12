import { describe, expect, it } from "vitest";
import {
  buildNextThreadOrder,
  resolveProjectChatDragEndOutcome,
} from "./projectChatHistoryDrag";

describe("project chat drag helpers", () => {
  it("inserts a moved thread after the target thread in the same domain", () => {
    const nextOrder = buildNextThreadOrder({
      sourceThreadId: "thread-1",
      targetThreadId: "thread-3",
      targetGroupId: "group-a",
      placement: "after",
      sourceThreadPinned: false,
      preferredOrder: ["thread-1", "thread-2", "thread-3"],
      fallbackOrder: ["thread-1", "thread-2", "thread-3"],
      threadGroupById: new Map([
        ["thread-1", "group-a"],
        ["thread-2", "group-a"],
        ["thread-3", "group-a"],
      ]),
      threadPinnedById: new Map([
        ["thread-1", false],
        ["thread-2", false],
        ["thread-3", false],
      ]),
    });

    expect(nextOrder).toEqual(["thread-2", "thread-3", "thread-1"]);
  });

  it("prefers the pointer-group fallback when the resolved drop target lands in a different group", () => {
    const outcome = resolveProjectChatDragEndOutcome({
      event: {
        active: { id: "project-chat-thread::thread-1" },
        delta: { x: 0, y: 20 },
        over: { id: "project-chat-thread::thread-2" },
        collisions: [],
      } as never,
      groupIdSet: new Set(["group-a", "group-b"]),
      groupSections: [],
      latestThreadDropTarget: null,
      pinnedSortableGroupIds: [],
      pinnedThreadIdsSet: new Set<string>(),
      pointerCurrent: null,
      pointerGroupId: "group-b",
      pointerStart: null,
      threadGroupById: new Map([
        ["thread-1", "group-a"],
        ["thread-2", "group-a"],
      ]),
      threadPinnedById: new Map([
        ["thread-1", false],
        ["thread-2", false],
      ]),
      unpinnedSortableGroupIds: [],
    });

    expect(outcome).toEqual({
      kind: "move-thread",
      sourceThreadId: "thread-1",
      dropTarget: {
        groupId: "group-b",
        targetThreadId: null,
        placement: "after",
        pinDomain: "unpinned",
      },
    });
  });
});
