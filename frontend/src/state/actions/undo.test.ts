import { useLocalStorage, useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectStateBackendUpdate } from "testUtils/projectStateBackendUpdate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProjectChatThreadStorageUndoStackForTests,
  createProjectChatThreadGroup,
  deleteProjectChatThreadGroup,
  setProjectChatThreadGroupAssignment,
} from "./projectChatThreads";
import { redoProjectState, undoProjectState } from "./undo";

const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);
const routeUndoMock = vi.fn();
const routeRedoMock = vi.fn();
const processProjectStateUpdateFromBackendMock = vi.fn();
const projectStateUpdateResponse = {
  status: 200,
  hasResponse: true,
  data: createProjectStateBackendUpdate({
    projectState: {
      projectConfig: {
        id: "project-a",
        name: "Alpha",
      },
    },
  }),
};
vi.mock("openapi/http", () => ({
  undo: (...args: unknown[]) => routeUndoMock(...args),
  redo: (...args: unknown[]) => routeRedoMock(...args),
}));
vi.mock("openapi/http/result", () => ({
  callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
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
    callOpenAPIMock.mockClear();
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
        body: {
          steps: 1,
          projectConfigId: "project-a",
        },
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
        body: {
          steps: 1,
          projectConfigId: "project-a",
        },
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
        body: {
          steps: 1,
          projectConfigId: "project-a",
        },
      });
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      projectStateUpdateResponse.data,
    );
    expect(useMisc.getState().undoOrRedoWasTriggered).toBe(true);
  });
});
