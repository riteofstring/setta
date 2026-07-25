import { afterEach, describe, expect, test, vi } from "vitest";

import {
  conversationCreationRequestEvent,
  type ConversationCreationEventDetail,
} from "../features/easy-button/conversation-creation-command";
import type { WorkspaceRuntime } from "./workspace-runtime";
import {
  executeWorkspaceFrameAction,
  workspaceFrameActionAllowed,
  workspaceFrameActionLimitState,
  type WorkspaceFrameAction,
} from "./workspace-frame-actions";

describe("workspace frame actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("executes raw surface actions in a new pane or exact empty frame", () => {
    const action = browserSurfaceAction();
    const store = {
      canOpenPane: vi.fn(() => true),
      configurePane: vi.fn(),
      openPane: vi.fn(),
      paneLimitState: vi.fn(() => ({
        allowed: true,
        count: 0,
        limit: null,
        surfaceKind: "browser",
      })),
    };
    const runLayoutAction = vi.fn((apply: () => void) => apply());
    const runtime = workspaceRuntime(store);

    expect(workspaceFrameActionAllowed(runtime.store, action)).toBe(true);
    expect(workspaceFrameActionLimitState(runtime.store, action)).toMatchObject({
      surfaceKind: "browser",
    });
    expect(
      executeWorkspaceFrameAction({
        action,
        placement: { kind: "new-pane" },
        runLayoutAction,
        runtime,
      }),
    ).toBe(true);
    expect(
      executeWorkspaceFrameAction({
        action,
        placement: { kind: "empty-frame", paneId: "workspace_pane_empty" },
        runLayoutAction,
        runtime,
      }),
    ).toBe(true);

    expect(store.openPane).toHaveBeenCalledWith(action.request);
    expect(store.configurePane).toHaveBeenCalledWith("workspace_pane_empty", action.request);
  });

  test("does not run a blocked raw surface action", () => {
    const action = browserSurfaceAction();
    const store = {
      canOpenPane: vi.fn(() => false),
      configurePane: vi.fn(),
      openPane: vi.fn(),
    };
    const runLayoutAction = vi.fn((apply: () => void) => apply());

    expect(
      executeWorkspaceFrameAction({
        action,
        placement: { kind: "new-pane" },
        runLayoutAction,
        runtime: workspaceRuntime(store),
      }),
    ).toBe(false);

    expect(runLayoutAction).not.toHaveBeenCalled();
    expect(store.openPane).not.toHaveBeenCalled();
    expect(store.configurePane).not.toHaveBeenCalled();
  });

  test("dispatches conversation creation with the requested frame placement", async () => {
    stubCustomEvent();
    const dispatched: Array<{
      detail: ConversationCreationEventDetail;
      type: string;
    }> = [];
    const dispatchEvent = vi.fn(
      (event: { detail: ConversationCreationEventDetail; type: string }) => {
        dispatched.push(event);
        event.detail.completion = Promise.resolve({
          conversationId: "conversation_created",
          paneId: "workspace_pane_empty",
          workspaceId: "workspace_topic",
        });
        return true;
      },
    );
    vi.stubGlobal("window", { dispatchEvent });
    const store = {
      canOpenPane: vi.fn(),
      configurePane: vi.fn(),
      openPane: vi.fn(),
    };

    const result = await executeWorkspaceFrameAction({
      action: { kind: "conversation" },
      placement: { kind: "empty-frame", paneId: "workspace_pane_empty" },
      runLayoutAction: vi.fn(),
      runtime: workspaceRuntime(store),
    });

    expect(result).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatched[0]?.type).toBe(conversationCreationRequestEvent);
    expect(dispatched[0]?.detail.request).toEqual({
      destination: { kind: "empty-frame", paneId: "workspace_pane_empty" },
      workspaceId: "workspace_topic",
    });
    expect(store.openPane).not.toHaveBeenCalled();
    expect(store.configurePane).not.toHaveBeenCalled();
  });

  test("dispatches folderless conversation creation from the empty app pane scene", async () => {
    stubCustomEvent();
    const dispatched: Array<{
      detail: ConversationCreationEventDetail;
      type: string;
    }> = [];
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn((event: { detail: ConversationCreationEventDetail; type: string }) => {
        dispatched.push(event);
        event.detail.completion = Promise.resolve({
          conversationId: "conversation_folderless",
          paneId: "workspace_pane_empty",
          workspaceId: null,
        });
        return true;
      }),
    });

    await executeWorkspaceFrameAction({
      action: { kind: "conversation" },
      placement: { kind: "new-pane" },
      runLayoutAction: vi.fn(),
      runtime: workspaceRuntime({}, "empty"),
    });

    expect(dispatched[0]?.detail.request).toEqual({
      destination: { kind: "new-pane" },
      workspaceId: null,
    });
  });
});

function browserSurfaceAction(): Extract<WorkspaceFrameAction, { kind: "surface" }> {
  return {
    kind: "surface",
    request: {
      surfaceKind: "browser",
      title: "Browser",
    },
  };
}

function workspaceRuntime(store: unknown, workspaceId = "workspace_topic"): WorkspaceRuntime {
  return {
    scene: { id: workspaceId },
    store,
  } as WorkspaceRuntime;
}

function stubCustomEvent(): void {
  vi.stubGlobal(
    "CustomEvent",
    class<T> {
      readonly detail: T;
      readonly type: string;

      constructor(type: string, init: { detail: T }) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  );
}
