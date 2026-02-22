import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProjectChatThreadStorageUndoStackForTests,
  createProjectChatThreadGroup,
  deleteProjectChatThread,
  deleteProjectChatThreadGroup,
  markProjectChatThreadViewed,
  reorderProjectChatThreads,
  renameProjectChatThreadGroup,
  reorderProjectChatThreadGroups,
  setProjectChatThreadGroupAssignment,
  toggleProjectChatThreadGroupCollapsed,
  toggleProjectChatThreadGroupPinned,
  toggleProjectChatThreadPinned,
  undoLastProjectChatThreadStorageMutation,
} from "./projectChatThreads";

describe("project chat thread storage helpers", () => {
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

  it("marks thread ids as viewed without duplicating entries", () => {
    // Viewing the same thread repeatedly should not grow the persisted list.
    markProjectChatThreadViewed("project-a", "chat-1");
    markProjectChatThreadViewed("project-a", "chat-1");

    expect(
      useLocalStorage.getState().viewedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);
  });

  it("creates a group once and reuses id for case-insensitive duplicates", () => {
    // Group names are normalized so users do not create duplicate folders.
    const first = createProjectChatThreadGroup("project-a", "Backend");
    const second = createProjectChatThreadGroup("project-a", "  backend  ");

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("Backend");
  });

  it("assigns and unassigns threads to known groups", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Frontend");
    if (!groupId) {
      throw new Error("Expected a project thread group id.");
    }

    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBe(groupId);

    setProjectChatThreadGroupAssignment("project-a", "chat-1", null);
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBeUndefined();
  });

  it("drops assignments when a target group does not exist", () => {
    setProjectChatThreadGroupAssignment("project-a", "chat-1", "missing-group");
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBeUndefined();
  });

  it("toggles collapsed state for project thread groups", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Ops");
    if (!groupId) {
      throw new Error("Expected a project thread group id.");
    }

    toggleProjectChatThreadGroupCollapsed("project-a", groupId);
    let groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups[0]?.collapsed).toBe(true);

    toggleProjectChatThreadGroupCollapsed("project-a", groupId);
    groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups[0]?.collapsed).toBe(false);
  });

  it("reorders groups using the provided id order and keeps omitted groups", () => {
    const alphaId = createProjectChatThreadGroup("project-a", "Alpha");
    const betaId = createProjectChatThreadGroup("project-a", "Beta");
    const gammaId = createProjectChatThreadGroup("project-a", "Gamma");
    if (!alphaId || !betaId || !gammaId) {
      throw new Error("Expected thread group ids.");
    }

    reorderProjectChatThreadGroups("project-a", [gammaId, alphaId]);
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups.map((group) => group.id)).toEqual([gammaId, alphaId, betaId]);
  });

  it("ignores duplicate and unknown group ids during reorder", () => {
    const alphaId = createProjectChatThreadGroup("project-a", "Alpha");
    const betaId = createProjectChatThreadGroup("project-a", "Beta");
    if (!alphaId || !betaId) {
      throw new Error("Expected thread group ids.");
    }

    reorderProjectChatThreadGroups("project-a", [
      betaId,
      "missing-group",
      betaId,
      alphaId,
    ]);
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups.map((group) => group.id)).toEqual([betaId, alphaId]);
  });

  it("reorders thread ids and keeps omitted ids at the end", () => {
    reorderProjectChatThreads("project-a", ["chat-3", "chat-1"]);
    reorderProjectChatThreads("project-a", ["chat-2"]);
    const order =
      useLocalStorage.getState().projectChatThreadOrderByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(order).toEqual(["chat-2", "chat-3", "chat-1"]);
  });

  it("ignores duplicate thread ids during thread reorder", () => {
    reorderProjectChatThreads("project-a", ["chat-1", "chat-2"]);
    reorderProjectChatThreads("project-a", ["chat-2", "chat-2", "chat-1"]);
    const order =
      useLocalStorage.getState().projectChatThreadOrderByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(order).toEqual(["chat-2", "chat-1"]);
  });

  it("renames a thread group when the target id exists", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }

    const renamed = renameProjectChatThreadGroup(
      "project-a",
      groupId,
      "Backlog",
    );
    expect(renamed).toBe(true);
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups[0]?.name).toBe("Backlog");
  });

  it("allows renaming groups to duplicate titles", () => {
    const alphaId = createProjectChatThreadGroup("project-a", "Alpha");
    const betaId = createProjectChatThreadGroup("project-a", "Beta");
    if (!alphaId || !betaId) {
      throw new Error("Expected thread group ids.");
    }

    const renamed = renameProjectChatThreadGroup("project-a", betaId, "Alpha");
    expect(renamed).toBe(true);
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups[1]?.name).toBe("Alpha");
  });

  it("toggles pinned state for project thread groups", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Pinned");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }

    toggleProjectChatThreadGroupPinned("project-a", groupId);
    let groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups[0]?.pinned).toBe(true);

    toggleProjectChatThreadGroupPinned("project-a", groupId);
    groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups[0]?.pinned).toBe(false);
  });

  it("moves pinned groups above unpinned groups", () => {
    const alphaId = createProjectChatThreadGroup("project-a", "Alpha");
    const betaId = createProjectChatThreadGroup("project-a", "Beta");
    if (!alphaId || !betaId) {
      throw new Error("Expected thread group ids.");
    }

    toggleProjectChatThreadGroupPinned("project-a", betaId);
    let groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups.map((group) => group.id)).toEqual([betaId, alphaId]);

    toggleProjectChatThreadGroupPinned("project-a", betaId);
    groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups.map((group) => group.id)).toEqual([betaId, alphaId]);
  });

  it("toggles pinned state for thread entries", () => {
    toggleProjectChatThreadPinned("project-a", "chat-1");
    let pinned =
      useLocalStorage.getState().pinnedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(pinned).toEqual(["chat-1"]);

    toggleProjectChatThreadPinned("project-a", "chat-1");
    pinned =
      useLocalStorage.getState().pinnedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(pinned).toEqual([]);
  });

  it("deletes a thread group and clears thread assignments for that group", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }
    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);
    setProjectChatThreadGroupAssignment("project-a", "chat-2", groupId);

    const deleted = deleteProjectChatThreadGroup("project-a", groupId);
    expect(deleted).toBe(true);
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups).toHaveLength(0);
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ],
    ).toEqual({});
  });

  it("soft deletes a thread id and removes local pinned/viewed/order references", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }
    markProjectChatThreadViewed("project-a", "chat-1");
    toggleProjectChatThreadPinned("project-a", "chat-1");
    reorderProjectChatThreads("project-a", ["chat-1", "chat-2"]);
    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);

    const deleted = deleteProjectChatThread("project-a", "chat-1");
    expect(deleted).toBe(true);
    expect(
      useLocalStorage.getState().trashedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-1"]);
    expect(
      useLocalStorage.getState().viewedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual([]);
    expect(
      useLocalStorage.getState().pinnedProjectChatThreadIdsByProjectConfigId[
        "project-a"
      ],
    ).toEqual([]);
    expect(
      useLocalStorage.getState().projectChatThreadOrderByProjectConfigId[
        "project-a"
      ],
    ).toEqual(["chat-2"]);
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBeUndefined();
  });

  it("undoes the most recent thread storage mutation for the active project", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }
    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);
    const deleted = deleteProjectChatThreadGroup("project-a", groupId);
    expect(deleted).toBe(true);

    const restored = undoLastProjectChatThreadStorageMutation("project-a");
    expect(restored).toBe(true);

    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups.map((group) => group.id)).toEqual([groupId]);
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBe(groupId);
  });

  it("returns false when there is no thread storage mutation to undo", () => {
    const restored = undoLastProjectChatThreadStorageMutation("project-a");
    expect(restored).toBe(false);
  });
});
