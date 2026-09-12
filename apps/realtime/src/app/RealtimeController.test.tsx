import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitWorkspaceDocument,
  setWorkspaceSectionSize,
  type WorkspaceHost,
} from "@setta/workspace";

import type { Project, RuntimeEnvelope } from "../backend/generatedContract";
import { makeProject } from "../testProject";
import { RealtimeController } from "./RealtimeController";
import type { RealtimeActions } from "./runtimeContext";

const mocks = vi.hoisted(() => ({
  applyProject: vi.fn(),
  applyRuntimeSource: vi.fn(),
  connectProjectEvents: vi.fn(),
  connectRuntime: vi.fn(),
  fetchProject: vi.fn(),
  fetchRuntimeSource: vi.fn(),
  projectEvents: null as {
    onProject: (project: Project) => void;
  } | null,
  reloadRuntime: vi.fn(),
  renderedActions: null as RealtimeActions | null,
  renderedHost: null as unknown,
  runtimeHandlers: null as {
    onEnvelope: (envelope: RuntimeEnvelope) => void;
    onOpen: () => void;
  } | null,
  runtimeSend: vi.fn(() => true),
  uploadContent: vi.fn(),
}));

vi.mock("../backend/client", () => ({
  RealtimeClientError: class RealtimeClientError extends Error {
    public constructor(
      public readonly kind: string,
      message: string,
      public readonly status?: number,
    ) {
      super(message);
    }
  },
  applyProject: mocks.applyProject,
  applyRuntimeSource: mocks.applyRuntimeSource,
  connectProjectEvents: mocks.connectProjectEvents,
  connectRuntime: mocks.connectRuntime,
  fetchProject: mocks.fetchProject,
  fetchRuntimeSource: mocks.fetchRuntimeSource,
  reloadRuntime: mocks.reloadRuntime,
  uploadContent: mocks.uploadContent,
}));

vi.mock("./RealtimeView", () => ({
  RealtimeView: (props: {
    actions: RealtimeActions;
    host: WorkspaceHost | null;
  }) => {
    mocks.renderedActions = props.actions;
    mocks.renderedHost = props.host;
    return null;
  },
}));

type Deferred<Result> = {
  promise: Promise<Result>;
  resolve: (result: Result) => void;
};

function deferred<Result>(): Deferred<Result> {
  let resolve: (result: Result) => void = () => {};
  const promise = new Promise<Result>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function resizedProject(
  project: Project,
  revision: number,
  width: number,
): Project {
  return {
    ...project,
    layout: {
      ...project.layout,
      topLevelSections: {
        ...project.layout.topLevelSections,
        "input-main": {
          ...project.layout.topLevelSections["input-main"]!,
          width,
        },
      },
    },
    revision,
    sections: {
      ...project.sections,
      "input-main": { ...project.sections["input-main"]!, width },
    },
  };
}

describe("Realtime workspace mutation projection", () => {
  let element: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: () => {},
        matches: false,
        removeEventListener: () => {},
      })),
    );
    mocks.renderedActions = null;
    mocks.renderedHost = null;
    mocks.projectEvents = null;
    mocks.runtimeHandlers = null;
    mocks.runtimeSend.mockReset().mockReturnValue(true);
    mocks.connectProjectEvents.mockImplementation((handlers) => {
      mocks.projectEvents = handlers;
      return () => {};
    });
    mocks.connectRuntime.mockImplementation((handlers) => {
      mocks.runtimeHandlers = handlers;
      return { close: () => {}, send: mocks.runtimeSend };
    });
    mocks.reloadRuntime.mockResolvedValue(undefined);
    mocks.uploadContent.mockResolvedValue({
      byteLength: 0,
      id: "unused-content",
      invocationId: "unused-invocation",
      mediaType: "image/png",
      sha256: "0".repeat(64),
    });
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    vi.unstubAllGlobals();
  });

  it("keeps the newest local size visible while earlier changes settle", async () => {
    const initial = makeProject();
    const first = deferred<Project>();
    const second = deferred<Project>();
    mocks.fetchProject.mockResolvedValue(initial);
    mocks.applyProject
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    await act(async () => root.render(<RealtimeController />));
    await vi.waitFor(() => expect(mocks.renderedHost).not.toBeNull());
    const host = mocks.renderedHost as WorkspaceHost;

    act(() => setWorkspaceSectionSize(host, "input-main", { width: 330 }));
    await vi.waitFor(() => expect(mocks.applyProject).toHaveBeenCalledOnce());
    act(() => setWorkspaceSectionSize(host, "input-main", { width: 360 }));

    await act(async () => first.resolve(resizedProject(initial, 5, 330)));
    await vi.waitFor(() => expect(mocks.applyProject).toHaveBeenCalledTimes(2));
    expect(host.getSnapshot().sections["input-main"]?.size.width).toBe(360);

    await act(async () => second.resolve(resizedProject(initial, 6, 360)));
    await vi.waitFor(() =>
      expect(host.getSnapshot().sections["input-main"]?.size.width).toBe(360),
    );
  });

  it("retains newer workspace presentation when a pending change settles", async () => {
    const initial = makeProject();
    const pending = deferred<Project>();
    const accepted = resizedProject(initial, 5, 330);
    mocks.fetchProject.mockResolvedValue(initial);
    mocks.applyProject.mockReturnValue(pending.promise);

    await act(async () => root.render(<RealtimeController />));
    await vi.waitFor(() => expect(mocks.projectEvents).not.toBeNull());
    const host = mocks.renderedHost as WorkspaceHost;

    act(() => setWorkspaceSectionSize(host, "input-main", { width: 330 }));
    await vi.waitFor(() => expect(mocks.applyProject).toHaveBeenCalledOnce());
    await act(async () => mocks.projectEvents!.onProject(accepted));
    act(() => {
      const document = host.getSnapshot();
      commitWorkspaceDocument(host, {
        ...document,
        sections: {
          ...document.sections,
          "input-main": {
            ...document.sections["input-main"]!,
            isMinimized: true,
          },
        },
      });
    });

    await act(async () => pending.resolve(accepted));

    await vi.waitFor(() =>
      expect(host.getSnapshot().sections["input-main"]?.isMinimized).toBe(true),
    );
  });

  it("separates interaction events from one lazy startup event per binding configuration", async () => {
    const initial = makeProject();
    initial.bindings = [
      {
        ...initial.bindings[0]!,
        id: "startup-input",
        materialization: {
          retention: "lastSuccessful",
          startup: "whenStale",
        },
        trigger: {
          event: "change",
          kind: "event",
          sectionId: "input-main",
        },
      },
    ];
    mocks.fetchProject.mockResolvedValue(initial);

    await act(async () => root.render(<RealtimeController />));
    await vi.waitFor(() => expect(mocks.runtimeHandlers).not.toBeNull());
    act(() => {
      mocks.runtimeHandlers!.onOpen();
      mocks.runtimeHandlers!.onEnvelope({
        snapshot: {
          invocations: {},
          publishedByBinding: {},
          retainedByBinding: {},
          sessionId: "session-one",
          values: {},
          workerState: "ready",
        },
        type: "snapshot",
      });
    });
    await vi.waitFor(() => expect(mocks.renderedActions).not.toBeNull());
    const actions = mocks.renderedActions!;

    expect(actions.emit("input-main", "change", { value: "changed" })).toBe(
      true,
    );
    const createPayload = vi.fn(() => ({ value: "initial" }));
    await expect(
      actions.initialize("input-main", "change", createPayload),
    ).resolves.toBe(true);
    await expect(
      actions.initialize("input-main", "change", createPayload),
    ).resolves.toBe(false);

    expect(createPayload).toHaveBeenCalledOnce();
    expect(mocks.runtimeSend).toHaveBeenNthCalledWith(1, {
      cause: "interaction",
      event: "change",
      payload: { value: "changed" },
      sectionId: "input-main",
      sessionId: "session-one",
      type: "event",
    });
    expect(mocks.runtimeSend).toHaveBeenNthCalledWith(2, {
      cause: "startup",
      event: "change",
      payload: { value: "initial" },
      sectionId: "input-main",
      sessionId: "session-one",
      type: "event",
    });

    act(() => {
      mocks.runtimeHandlers!.onEnvelope({
        snapshot: {
          invocations: {},
          publishedByBinding: {},
          retainedByBinding: {},
          sessionId: "session-two",
          values: {},
          workerState: "ready",
        },
        type: "snapshot",
      });
    });
    await expect(
      actions.initialize("input-main", "change", createPayload),
    ).resolves.toBe(true);
    expect(createPayload).toHaveBeenCalledTimes(2);
    expect(mocks.runtimeSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ cause: "startup", sessionId: "session-two" }),
    );
  });
});
