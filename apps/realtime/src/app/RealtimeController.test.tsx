import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitWorkspaceDocument,
  setWorkspaceSectionSize,
  type WorkspaceHost,
} from "@setta/workspace";

import type { Project } from "../backend/generatedContract";
import { makeProject } from "../testProject";
import { RealtimeController } from "./RealtimeController";

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
  renderedHost: null as unknown,
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
  RealtimeView: (props: { host: WorkspaceHost | null }) => {
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
    mocks.renderedHost = null;
    mocks.projectEvents = null;
    mocks.connectProjectEvents.mockImplementation((handlers) => {
      mocks.projectEvents = handlers;
      return () => {};
    });
    mocks.connectRuntime.mockReturnValue({ close: () => {}, send: () => true });
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
});
