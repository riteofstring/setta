import { useLocalStorage } from "state/stores/uiPreferenceStores";
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

  it("routes undo to backend even when local thread deletions exist", () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }
    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);
    const deleted = deleteProjectChatThreadGroup("project-a", groupId);
    expect(deleted).toBe(true);

    undoProjectState();

    expect(routeUndoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
    const groups =
      useLocalStorage.getState().projectChatThreadGroupsByProjectConfigId[
        "project-a"
      ] ?? [];
    expect(groups.map((group) => group.id)).toEqual([]);
    expect(
      useLocalStorage.getState().projectChatThreadAssignmentsByProjectConfigId[
        "project-a"
      ]?.["chat-1"],
    ).toBeUndefined();
  });

  it("routes redo through backend endpoint", () => {
    redoProjectState();

    expect(routeRedoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
  });
});
