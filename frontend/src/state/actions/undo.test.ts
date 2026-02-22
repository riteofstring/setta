import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProjectChatThreadStorageUndoStackForTests,
  createProjectChatThreadGroup,
  deleteProjectChatThreadGroup,
  setProjectChatThreadGroupAssignment,
} from "./projectChatThreads";
import { redoProjectState, undoProjectState } from "./undo";

const routeUndoMock = vi.fn();
const routeRedoMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_undo: (...args: unknown[]) => routeUndoMock(...args),
  route_redo: (...args: unknown[]) => routeRedoMock(...args),
}));

vi.mock("./sectionInfos", () => ({
  getCurrProjectConfigId: () => "project-a",
}));

describe("undo actions", () => {
  beforeEach(() => {
    resetProjectStores();
    clearProjectChatThreadStorageUndoStackForTests();
    routeUndoMock.mockReset();
    routeRedoMock.mockReset();
    useLocalStorage.setState({
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadOrderByProjectConfigId: {},
      pinnedProjectChatThreadIdsByProjectConfigId: {},
      trashedProjectChatThreadIdsByProjectConfigId: {},
    });
  });

  it("routes to backend undo when no local thread mutation is pending", () => {
    undoProjectState();

    expect(routeUndoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
  });

  it("undoes local thread storage deletions before backend undo", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }
    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);
    const deleted = deleteProjectChatThreadGroup("project-a", groupId);
    expect(deleted).toBe(true);

    undoProjectState();

    expect(routeUndoMock).not.toHaveBeenCalled();
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

  it("routes redo through backend endpoint", () => {
    redoProjectState();

    expect(routeRedoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
  });
});
