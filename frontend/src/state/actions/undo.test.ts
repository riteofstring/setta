import { useLocalStorage, useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectStateSingleConfigWithCompletedOpIDs } from "utils/generatedTypes";
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
const processProjectStateUpdateFromBackendMock = vi.fn();

const projectStateUpdateResponse = {
  status: 200,
  hasResponse: true,
  data: createProjectStateSingleConfigWithCompletedOpIDs({
    projectState: {
      projectConfig: {
        id: "project-a",
        name: "Alpha",
      },
    },
  }),
};

vi.mock("utils/generatedEndpoints", () => ({
  route_undo: (...args: unknown[]) => routeUndoMock(...args),
  route_redo: (...args: unknown[]) => routeRedoMock(...args),
}));

vi.mock("./sectionInfos", () => ({
  getCurrProjectConfigId: () => "project-a",
  processProjectStateUpdateFromBackend: (...args: unknown[]) =>
    processProjectStateUpdateFromBackendMock(...args),
}));

describe("undo actions", () => {
  beforeEach(() => {
    resetProjectStores();
    clearProjectChatThreadStorageUndoStackForTests();
    routeUndoMock.mockReset();
    routeRedoMock.mockReset();
    processProjectStateUpdateFromBackendMock.mockReset();
    routeUndoMock.mockResolvedValue(projectStateUpdateResponse);
    routeRedoMock.mockResolvedValue(projectStateUpdateResponse);
    useLocalStorage.setState({
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadOrderByProjectConfigId: {},
      pinnedProjectChatThreadIdsByProjectConfigId: {},
      trashedProjectChatThreadIdsByProjectConfigId: {},
    });
    useMisc.setState({ undoOrRedoWasTriggered: false });
  });

  it("routes to backend undo when no local thread mutation is pending", async () => {
    undoProjectState();

    await vi.waitFor(() => {
      expect(routeUndoMock).toHaveBeenCalledWith({
        steps: 1,
        projectConfigId: "project-a",
      });
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      projectStateUpdateResponse.data,
    );
    expect(useMisc.getState().undoOrRedoWasTriggered).toBe(true);
  });

  it("routes undo to backend even when local thread deletions exist", async () => {
    const groupId = createProjectChatThreadGroup("project-a", "Backend");
    if (!groupId) {
      throw new Error("Expected thread group id.");
    }
    setProjectChatThreadGroupAssignment("project-a", "chat-1", groupId);
    const deleted = deleteProjectChatThreadGroup("project-a", groupId);
    expect(deleted).toBe(true);

    undoProjectState();

    await vi.waitFor(() => {
      expect(routeUndoMock).toHaveBeenCalledWith({
        steps: 1,
        projectConfigId: "project-a",
      });
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

  it("routes redo through backend endpoint", async () => {
    redoProjectState();

    await vi.waitFor(() => {
      expect(routeRedoMock).toHaveBeenCalledWith({
        steps: 1,
        projectConfigId: "project-a",
      });
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      projectStateUpdateResponse.data,
    );
    expect(useMisc.getState().undoOrRedoWasTriggered).toBe(true);
  });
});
