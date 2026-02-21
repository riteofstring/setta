import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectChatThreadGroup,
  markProjectChatThreadViewed,
  reorderProjectChatThreadGroups,
  setProjectChatThreadGroupAssignment,
  toggleProjectChatThreadGroupCollapsed,
} from "./projectChatThreads";

describe("project chat thread storage helpers", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
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
});
