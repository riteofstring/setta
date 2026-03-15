import { beforeEach, describe, expect, it } from "vitest";
import {
  canUndoLastProjectChatThreadStorageMutation,
  clearProjectChatThreadStorageUndoStackForTests,
  pushProjectChatThreadStorageUndoEntry,
  takeLastProjectChatThreadStorageUndoEntry,
  type ProjectChatThreadDeleteUndoInverse,
} from "./projectChatThreadStorageUndoStack";

function createThreadDeleteUndoInverse(
  threadId: string,
): ProjectChatThreadDeleteUndoInverse {
  return {
    type: "thread_delete",
    threadId,
    assignmentGroupId: null,
    viewedIndex: -1,
    pinnedIndex: -1,
    orderIndex: -1,
  };
}

describe("project chat thread storage undo stack", () => {
  beforeEach(() => {
    clearProjectChatThreadStorageUndoStackForTests();
  });

  it("takes the newest undo entry for the requested project without dropping other projects", () => {
    // Each project should get its own LIFO undo stream even when entries interleave.
    pushProjectChatThreadStorageUndoEntry(
      "project-a",
      createThreadDeleteUndoInverse("chat-a-1"),
    );
    pushProjectChatThreadStorageUndoEntry(
      "project-b",
      createThreadDeleteUndoInverse("chat-b-1"),
    );
    pushProjectChatThreadStorageUndoEntry(
      "project-a",
      createThreadDeleteUndoInverse("chat-a-2"),
    );

    expect(canUndoLastProjectChatThreadStorageMutation("project-a")).toBe(true);
    expect(canUndoLastProjectChatThreadStorageMutation("project-b")).toBe(true);

    expect(
      takeLastProjectChatThreadStorageUndoEntry("project-a")?.inverse,
    ).toMatchObject({
      type: "thread_delete",
      threadId: "chat-a-2",
    });
    expect(canUndoLastProjectChatThreadStorageMutation("project-a")).toBe(true);
    expect(
      takeLastProjectChatThreadStorageUndoEntry("project-b")?.inverse,
    ).toMatchObject({
      type: "thread_delete",
      threadId: "chat-b-1",
    });
    expect(canUndoLastProjectChatThreadStorageMutation("project-b")).toBe(
      false,
    );
    expect(
      takeLastProjectChatThreadStorageUndoEntry("project-a")?.inverse,
    ).toMatchObject({
      type: "thread_delete",
      threadId: "chat-a-1",
    });
    expect(canUndoLastProjectChatThreadStorageMutation("project-a")).toBe(
      false,
    );
  });

  it("keeps only the newest one hundred undo entries", () => {
    // The stack limit should evict the oldest entries without disturbing recency order.
    for (let index = 0; index <= 100; index += 1) {
      pushProjectChatThreadStorageUndoEntry(
        "project-a",
        createThreadDeleteUndoInverse(`chat-${index}`),
      );
    }

    const consumedThreadIds: Array<string> = [];
    for (;;) {
      const entry = takeLastProjectChatThreadStorageUndoEntry("project-a");
      if (!entry) {
        break;
      }
      if (entry.inverse.type !== "thread_delete") {
        continue;
      }
      consumedThreadIds.push(entry.inverse.threadId);
    }

    expect(consumedThreadIds).toHaveLength(100);
    expect(consumedThreadIds[0]).toBe("chat-100");
    expect(consumedThreadIds[consumedThreadIds.length - 1]).toBe("chat-1");
  });
});
