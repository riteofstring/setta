import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearProjectChatThreadStorageUndoStackForTests,
  createProjectChatThreadGroup,
  deleteProjectChatThreadGroup,
  setProjectChatThreadGroupAssignment,
} from "./projectChatThreads";
import {
  flushUndoRedoQueueForTests,
  redoProjectState,
  resetUndoRedoQueueForTests,
  undoProjectState,
} from "./undo";

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
  beforeEach(async () => {
    await flushUndoRedoQueueForTests();
    resetUndoRedoQueueForTests();
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

  it("routes to backend undo when no local thread mutation is pending", async () => {
    undoProjectState();
    await flushUndoRedoQueueForTests();

    expect(routeUndoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
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
    await flushUndoRedoQueueForTests();

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

  it("routes redo through backend endpoint", async () => {
    redoProjectState();
    await flushUndoRedoQueueForTests();

    expect(routeRedoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
  });

  it("coalesces repeated undo intents into a multi-step request", async () => {
    undoProjectState();
    undoProjectState();
    undoProjectState();
    await flushUndoRedoQueueForTests();

    expect(routeUndoMock).toHaveBeenCalledTimes(1);
    expect(routeUndoMock).toHaveBeenCalledWith({
      steps: 3,
      projectConfigId: "project-a",
    });
  });

  it("cancels opposite-direction key repeat deltas before dispatch", async () => {
    undoProjectState();
    redoProjectState();
    undoProjectState();
    redoProjectState();
    await flushUndoRedoQueueForTests();

    expect(routeUndoMock).not.toHaveBeenCalled();
    expect(routeRedoMock).not.toHaveBeenCalled();
  });

  it("queues opposite-direction intents while one request is in flight", async () => {
    let resolveUndoRequest: ((value: unknown) => void) | null = null;
    const undoRequest = new Promise((resolve) => {
      resolveUndoRequest = resolve;
    });
    routeUndoMock.mockReturnValueOnce(undoRequest);

    undoProjectState();
    await Promise.resolve();
    redoProjectState();
    redoProjectState();
    resolveUndoRequest?.({ data: null, status: 200, hasResponse: true });
    await flushUndoRedoQueueForTests();

    expect(routeUndoMock).toHaveBeenCalledTimes(1);
    expect(routeUndoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
    expect(routeRedoMock).toHaveBeenCalledTimes(1);
    expect(routeRedoMock).toHaveBeenCalledWith({
      steps: 2,
      projectConfigId: "project-a",
    });
  });
});
