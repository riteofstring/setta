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
const flushAllPendingCodeUpdatesMock = vi.fn();
const flushPendingGenCodeUpdatesMock = vi.fn();
const flushPendingParamEnteredValueUpdatesMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_undo: (...args: unknown[]) => routeUndoMock(...args),
  route_redo: (...args: unknown[]) => routeRedoMock(...args),
}));

vi.mock("./codeUpdates", () => ({
  flushAllPendingCodeUpdates: (...args: unknown[]) =>
    flushAllPendingCodeUpdatesMock(...args),
  flushPendingGenCodeUpdates: (...args: unknown[]) =>
    flushPendingGenCodeUpdatesMock(...args),
}));

vi.mock("./paramValueUpdates", () => ({
  flushPendingParamEnteredValueUpdates: (...args: unknown[]) =>
    flushPendingParamEnteredValueUpdatesMock(...args),
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
    flushAllPendingCodeUpdatesMock.mockReset();
    flushPendingGenCodeUpdatesMock.mockReset();
    flushPendingParamEnteredValueUpdatesMock.mockReset();
    flushAllPendingCodeUpdatesMock.mockResolvedValue(undefined);
    flushPendingGenCodeUpdatesMock.mockResolvedValue(undefined);
    flushPendingParamEnteredValueUpdatesMock.mockResolvedValue(undefined);
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

    expect(flushAllPendingCodeUpdatesMock).toHaveBeenCalledTimes(1);
    expect(flushPendingGenCodeUpdatesMock).toHaveBeenCalledTimes(1);
    expect(flushPendingParamEnteredValueUpdatesMock).toHaveBeenCalledTimes(1);
    expect(routeUndoMock).toHaveBeenCalledWith({
      steps: 1,
      projectConfigId: "project-a",
    });
    expect(
      flushAllPendingCodeUpdatesMock.mock.invocationCallOrder[0],
    ).toBeLessThan(routeUndoMock.mock.invocationCallOrder[0]);
    expect(
      flushPendingGenCodeUpdatesMock.mock.invocationCallOrder[0],
    ).toBeLessThan(routeUndoMock.mock.invocationCallOrder[0]);
    expect(
      flushPendingParamEnteredValueUpdatesMock.mock.invocationCallOrder[0],
    ).toBeLessThan(routeUndoMock.mock.invocationCallOrder[0]);
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

  it("waits for pending write flushes before dispatching undo", async () => {
    let resolveParamFlush: (() => void) | null = null;
    const paramFlushPromise = new Promise<void>((resolve) => {
      resolveParamFlush = resolve;
    });
    flushPendingParamEnteredValueUpdatesMock.mockReturnValueOnce(
      paramFlushPromise,
    );

    undoProjectState();
    await Promise.resolve();
    expect(routeUndoMock).not.toHaveBeenCalled();

    resolveParamFlush?.();
    await flushUndoRedoQueueForTests();
    expect(routeUndoMock).toHaveBeenCalledTimes(1);
  });
});
