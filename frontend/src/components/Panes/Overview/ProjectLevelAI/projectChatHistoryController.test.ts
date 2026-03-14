import {
  clearProjectChatThreadStorageUndoStackForTests,
  createProjectChatThreadGroup,
} from "state/actions/projectChatThreads";
import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectChatHistoryGroup,
  deleteProjectChatHistoryGroup,
  deleteProjectChatHistoryThread,
  moveProjectChatHistoryThread,
  selectProjectChatHistoryEntry,
  startProjectChatHistoryThread,
  startProjectChatHistoryThreadInGroup,
} from "./projectChatHistoryController";
import {
  DRAFT_THREAD_ENTRY_ID,
  PINNED_THREAD_DOMAIN,
  UNPINNED_THREAD_DOMAIN,
} from "./projectChatHistoryDragUtils";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

function createHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry>,
): ProjectChatHistoryEntry {
  return {
    chatId: "chat-1",
    label: "Thread",
    nameSource: null,
    lastUpdatedMs: 1,
    waitingForResponse: false,
    runType: "llm_chat",
    engineConfigId: null,
    ...overrides,
  };
}

describe("projectChatHistoryController", () => {
  beforeEach(() => {
    resetProjectStores();
    clearProjectChatThreadStorageUndoStackForTests();
    useLocalStorage.setState({
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadOrderByProjectConfigId: {},
      pinnedProjectChatThreadIdsByProjectConfigId: {},
      trashedProjectChatThreadIdsByProjectConfigId: {},
    });
  });

  it("creates a new group, selects it, and starts editing with the next default name", () => {
    // The controller should keep group naming and focus transitions out of the surface component.
    const selectedGroupIds: Array<string | null> = [];
    const editingGroupIds: Array<string | null> = [];

    createProjectChatHistoryGroup({
      projectConfigId: "project-a",
      existingGroupNames: ["New Group"],
      onSelectedGroupChange: (groupId) => {
        selectedGroupIds.push(groupId);
      },
      setEditingGroupId: (groupId) => {
        editingGroupIds.push(groupId);
      },
    });

    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    const createdGroupId = groups[0]?.id;
    if (!createdGroupId) {
      throw new Error("Expected a created thread group id.");
    }

    expect(groups[0]?.name).toBe("New Group 2");
    expect(selectedGroupIds).toEqual([createdGroupId]);
    expect(editingGroupIds).toEqual([createdGroupId]);
  });

  it("selects a persisted thread, marks it viewed, and closes the history surface", () => {
    // Selecting a concrete thread should publish the chat id and persist a viewed marker.
    const selectedChatIds: Array<string | null | undefined> = [];
    let closeCount = 0;

    selectProjectChatHistoryEntry({
      entry: createHistoryEntry({
        chatId: "chat-1",
      }),
      closeOnSelect: true,
      onCloseThreadsView: () => {
        closeCount += 1;
      },
      projectConfigId: "project-a",
      setChatId: (nextChatId) => {
        selectedChatIds.push(nextChatId);
      },
    });

    expect(selectedChatIds).toEqual(["chat-1"]);
    expect(
      useLocalStorage.getState().viewedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);
    expect(closeCount).toBe(1);
  });

  it("treats the draft entry as an undefined chat selection without marking it viewed", () => {
    // Draft rows should reset selection to the pending thread slot rather than persisting a viewed thread id.
    const selectedChatIds: Array<string | null | undefined> = [];

    selectProjectChatHistoryEntry({
      entry: createHistoryEntry({
        chatId: DRAFT_THREAD_ENTRY_ID,
      }),
      closeOnSelect: false,
      projectConfigId: "project-a",
      setChatId: (nextChatId) => {
        selectedChatIds.push(nextChatId);
      },
    });

    expect(selectedChatIds).toEqual([undefined]);
    expect(
      useLocalStorage.getState().viewedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toBeUndefined();
  });

  it("starts a new thread inside a selected group through the existing group handler", () => {
    // When the history surface is scoped to a selected group, the generic new-thread action should reuse the group flow.
    const startedGroupIds: string[] = [];
    const selectedGroupIds: Array<string | null> = [];

    startProjectChatHistoryThread({
      selectedGroupId: "group-a",
      onStartNewThreadInGroup: () => undefined,
      startThreadInGroup: (groupId) => {
        startedGroupIds.push(groupId);
      },
      setChatId: () => {
        throw new Error("should not set the chat id when using group start");
      },
      closeOnSelect: true,
      onCloseThreadsView: () => {
        throw new Error("should not close directly when using group start");
      },
      onStartNewThread: undefined,
    });

    startProjectChatHistoryThreadInGroup({
      groupId: "group-a",
      onSelectedGroupChange: (groupId) => {
        selectedGroupIds.push(groupId);
      },
      onStartNewThreadInGroup: (groupId) => {
        startedGroupIds.push(groupId);
      },
      setChatId: () => {
        throw new Error(
          "should not set the chat id for controlled group start",
        );
      },
      closeOnSelect: true,
      onCloseThreadsView: () => {
        throw new Error("should not close directly for controlled group start");
      },
    });

    expect(startedGroupIds).toEqual(["group-a", "group-a"]);
    expect(selectedGroupIds).toEqual(["group-a"]);
  });

  it("moves a thread into a new group and persists the reordered thread order", () => {
    // Reordering should update both the persisted assignment and the visible order for future hydrations.
    const groupA = createProjectChatThreadGroup("project-a", "Alpha");
    const groupB = createProjectChatThreadGroup("project-a", "Beta");
    if (!groupA || !groupB) {
      throw new Error("Expected thread group ids.");
    }
    useLocalStorage.setState({
      projectChatThreadAssignmentsByProjectConfigId: {
        "project-a": {
          "chat-1": groupA,
          "chat-2": groupA,
          "chat-3": groupB,
        },
      },
      projectChatThreadOrderByProjectConfigId: {
        "project-a": ["chat-1", "chat-2", "chat-3"],
      },
      pinnedProjectChatThreadIdsByProjectConfigId: {
        "project-a": [],
      },
    });
    const selectedGroupIds: Array<string | null> = [];

    moveProjectChatHistoryThread({
      sourceThreadId: "chat-1",
      dropTarget: {
        groupId: groupB,
        targetThreadId: null,
        placement: "after",
        pinDomain: UNPINNED_THREAD_DOMAIN,
      },
      pinnedThreadIdsSet: new Set(),
      threadOrderIds: ["chat-1", "chat-2", "chat-3"],
      orderedVisibleThreadIds: ["chat-1", "chat-2", "chat-3"],
      threadGroupById: new Map([
        ["chat-1", groupA],
        ["chat-2", groupA],
        ["chat-3", groupB],
      ]),
      threadPinnedById: new Map([
        ["chat-1", false],
        ["chat-2", false],
        ["chat-3", false],
      ]),
      projectConfigId: "project-a",
      onSelectedGroupChange: (groupId) => {
        selectedGroupIds.push(groupId);
      },
    });

    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBe(groupB);
    expect(
      useLocalStorage.getState().projectChatThreadOrderByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-2", "chat-3", "chat-1"]);
    expect(selectedGroupIds).toEqual([groupB]);
  });

  it("ignores thread moves that cross pin domains", () => {
    // The controller should not persist a move when the computed drop target is in the wrong pin partition.
    const groupA = createProjectChatThreadGroup("project-a", "Alpha");
    if (!groupA) {
      throw new Error("Expected a thread group id.");
    }
    useLocalStorage.setState({
      projectChatThreadAssignmentsByProjectConfigId: {
        "project-a": {
          "chat-1": groupA,
        },
      },
      projectChatThreadOrderByProjectConfigId: {
        "project-a": ["chat-1"],
      },
      pinnedProjectChatThreadIdsByProjectConfigId: {
        "project-a": [],
      },
    });

    moveProjectChatHistoryThread({
      sourceThreadId: "chat-1",
      dropTarget: {
        groupId: groupA,
        targetThreadId: null,
        placement: "after",
        pinDomain: PINNED_THREAD_DOMAIN,
      },
      pinnedThreadIdsSet: new Set(),
      threadOrderIds: ["chat-1"],
      orderedVisibleThreadIds: ["chat-1"],
      threadGroupById: new Map([["chat-1", groupA]]),
      threadPinnedById: new Map([["chat-1", false]]),
      projectConfigId: "project-a",
    });

    expect(
      useLocalStorage.getState().projectChatThreadOrderByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);
  });

  it("clears active chat and selected group when the controller deletes them", () => {
    // Delete flows should keep surrounding selection state consistent with the persisted storage update.
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected a thread group id.");
    }
    useLocalStorage.setState({
      projectChatThreadAssignmentsByProjectConfigId: {
        "project-a": {
          "chat-1": groupId,
        },
      },
      projectChatThreadOrderByProjectConfigId: {
        "project-a": ["chat-1"],
      },
      viewedProjectChatThreadIdsByProjectConfigId: {
        "project-a": ["chat-1"],
      },
    });
    const selectedChatIds: Array<string | null | undefined> = [];
    const selectedGroupIds: Array<string | null> = [];

    deleteProjectChatHistoryThread({
      projectConfigId: "project-a",
      threadId: "chat-1",
      chatId: "chat-1",
      setChatId: (nextChatId) => {
        selectedChatIds.push(nextChatId);
      },
    });
    deleteProjectChatHistoryGroup({
      projectConfigId: "project-a",
      groupId,
      selectedGroupId: groupId,
      onSelectedGroupChange: (nextGroupId) => {
        selectedGroupIds.push(nextGroupId);
      },
    });

    expect(selectedChatIds).toEqual([undefined]);
    expect(selectedGroupIds).toEqual([null]);
    expect(
      useLocalStorage.getState().trashedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);
    expect(
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ],
    ).toEqual([]);
  });
});
