import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceHost,
  WorkspaceProvider,
  type WorkspaceHost,
} from "@setta/workspace";

import { projectWorkspaceDocument } from "../app/projectProjection";
import { RealtimeContext, type RealtimeActions } from "../app/runtimeContext";
import {
  initialRuntimeViewState,
  runtimeValueKey,
  type RuntimeViewState,
} from "../app/runtimeState";
import type { ContentReference, Project } from "../backend/generatedContract";
import { makeProject } from "../testProject";
import { DrawingSection } from "./DrawingSection";

const drawingMocks = vi.hoisted(() => {
  const selection = {
    canAlign: false,
    canClearSelection: false,
    canCopy: false,
    canDelete: false,
    canDistribute: false,
    canDuplicate: false,
    canGroup: false,
    canLock: false,
    canMoveBackward: false,
    canMoveForward: false,
    canPaste: false,
    canSelectAll: false,
    canUngroup: false,
    cornerRadius: null,
    count: 0,
    fillColor: null,
    fillEnabled: null,
    fontFamily: null,
    fontSize: null,
    fontStyle: null,
    fontWeight: null,
    kind: "none",
    locked: null,
    opacity: null,
    strokeColor: null,
    strokeEnabled: null,
    strokeWidth: null,
    supportsCornerRadius: false,
    supportsFill: false,
    supportsStroke: false,
    supportsTypography: false,
    textAlign: null,
  };
  return {
    captureSnapshot: vi.fn(),
    loadDocument: vi.fn(),
    loadScene: vi.fn(),
    scene: { objects: [] } as Record<string, unknown>,
    selection,
    settle: null as (() => void) | null,
  };
});

vi.mock("./drawingRuntime", () => ({
  RealtimeDrawingRuntime: class {
    public readonly canvas = { getActiveObject: () => undefined };

    public constructor(
      _element: HTMLCanvasElement,
      options: { onSettled: () => void },
    ) {
      drawingMocks.settle = options.onSettled;
    }

    public addImage = vi.fn(async () => true);
    public capturePreview = drawingMocks.captureSnapshot;
    public captureSnapshot = drawingMocks.captureSnapshot;
    public dispose = vi.fn(async () => {});
    public getLogicalSize = () => ({ height: 320, width: 480 });
    public getSelectionSnapshot = () => drawingMocks.selection;
    public loadDocument = drawingMocks.loadDocument;
    public loadScene = drawingMocks.loadScene;
    public setCreationColor = vi.fn();
    public setGridSnap = vi.fn();
    public setTool = vi.fn();
    public subscribeSelection = () => () => {};
    public toScene = () => drawingMocks.scene;
  },
}));

vi.mock("./drawingSurfaceRegistry", () => ({
  EMPTY_DRAWING_SELECTION_SNAPSHOT: drawingMocks.selection,
  registerDrawingSurface: () => () => {},
}));

vi.mock("./drawingViewportController", () => ({
  DrawingViewportController: class {
    public dispose = vi.fn();
    public resizeLogical = vi.fn();
    public resizeStage = vi.fn();
    public setGrid = vi.fn();
  },
}));

class TestResizeObserver {
  public disconnect(): void {}
  public observe(): void {}
  public unobserve(): void {}
}

type Deferred<Result> = {
  promise: Promise<Result>;
  resolve: (value: Result) => void;
};

function deferred<Result>(): Deferred<Result> {
  let resolve: (value: Result) => void = () => {};
  const promise = new Promise<Result>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function startupProject(): Project {
  const project = makeProject();
  project.bindings = [
    {
      ...project.bindings[0]!,
      id: "drawing-startup",
      materialization: {
        retention: "lastSuccessful",
        startup: "whenStale",
      },
      trigger: { event: "snapshot", sectionId: "drawing-main" },
    },
  ];
  return project;
}

describe("drawing startup materialization", () => {
  let element: HTMLDivElement;
  let host: WorkspaceHost;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.resetAllMocks();
    drawingMocks.scene = { objects: [] };
    drawingMocks.settle = null;
    element = document.createElement("div");
    document.body.append(element);
    host = createWorkspaceHost();
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.dispose();
    element.remove();
    vi.unstubAllGlobals();
  });

  it("captures only after each canonical Fabric document finishes loading", async () => {
    const project = startupProject();
    const firstLoad = deferred<boolean>();
    const secondLoad = deferred<boolean>();
    drawingMocks.loadScene.mockReturnValueOnce(firstLoad.promise);
    drawingMocks.loadDocument.mockReturnValueOnce(secondLoad.promise);
    drawingMocks.captureSnapshot.mockImplementation(async () => ({
      blob: new Blob(["drawing"], { type: "image/png" }),
      height: 320,
      scene: drawingMocks.scene,
      width: 480,
    }));
    const reference: ContentReference = {
      byteLength: 7,
      id: "drawing-content",
      invocationId: "drawing-stage",
      mediaType: "image/png",
      sha256: "a".repeat(64),
    };
    const uploadContent = vi.fn(async () => reference);
    const initialize = vi.fn(
      async (
        _sectionId: string,
        _event: "change" | "snapshot",
        createPayload: () => unknown | Promise<unknown>,
      ) => {
        await createPayload();
        return true;
      },
    );
    const actions = {
      applyRuntimeSource: vi.fn(async () => true),
      cancel: vi.fn(() => true),
      commitSectionData: vi.fn<RealtimeActions["commitSectionData"]>(
        async () => true,
      ),
      emit: vi.fn(() => true),
      initialize,
      reload: vi.fn(async () => true),
      reportError: vi.fn(),
      uploadContent,
    } satisfies RealtimeActions;
    const runtime = {
      ...initialRuntimeViewState,
      connection: "connected",
      sessionId: "session-main",
      workerState: "ready",
    } satisfies RuntimeViewState;
    const render = (nextProject: Project, nextRuntime: RuntimeViewState) => {
      const section =
        projectWorkspaceDocument(nextProject).sections["drawing-main"]!;
      return (
        <RealtimeContext.Provider
          value={{
            actions,
            error: null,
            project: nextProject,
            runtime: nextRuntime,
            source: {
              activationRejected: false,
              document: null,
              notice: null,
              status: "unavailable",
            },
          }}
        >
          <WorkspaceProvider host={host}>
            <DrawingSection section={section} />
          </WorkspaceProvider>
        </RealtimeContext.Provider>
      );
    };

    await act(async () => root.render(render(project, runtime)));
    expect(initialize).not.toHaveBeenCalled();
    expect(drawingMocks.captureSnapshot).not.toHaveBeenCalled();
    expect(uploadContent).not.toHaveBeenCalled();

    await act(async () => firstLoad.resolve(true));
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce());
    expect(drawingMocks.captureSnapshot).toHaveBeenCalledOnce();
    expect(uploadContent).toHaveBeenCalledOnce();

    const changedProject = structuredClone(project);
    changedProject.revision += 1;
    changedProject.bindings[0]!.handler = "render_changed";
    const nextScene = { objects: [{ type: "Rect" }], version: "7.4.0" };
    await act(async () =>
      root.render(
        render(changedProject, {
          ...runtime,
          values: {
            [runtimeValueKey("drawing-main", "scene")]: nextScene,
          },
        }),
      ),
    );
    expect(drawingMocks.loadDocument).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledOnce();
    expect(drawingMocks.captureSnapshot).toHaveBeenCalledOnce();

    await act(async () => secondLoad.resolve(true));
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(2));
    expect(drawingMocks.captureSnapshot).toHaveBeenCalledTimes(2);
    expect(uploadContent).toHaveBeenCalledTimes(2);

    const locallyCommittedScene = {
      objects: [{ type: "Path" }],
      version: "7.4.0",
    };
    drawingMocks.scene = locallyCommittedScene;
    await act(async () => {
      drawingMocks.settle?.();
      await vi.waitFor(() =>
        expect(actions.commitSectionData).toHaveBeenCalledOnce(),
      );
    });
    const settledDocument = actions.commitSectionData.mock.calls[0]![1];
    const acknowledgedProject = structuredClone(changedProject);
    acknowledgedProject.revision += 1;
    acknowledgedProject.sections["drawing-main"]!.data = settledDocument;
    await act(async () =>
      root.render(
        render(acknowledgedProject, {
          ...runtime,
          sessionId: "session-replaced",
        }),
      ),
    );
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(3));
    expect(drawingMocks.loadDocument).toHaveBeenCalledOnce();
    expect(drawingMocks.captureSnapshot).toHaveBeenCalledTimes(4);
    expect(uploadContent).toHaveBeenCalledTimes(4);
  });
});
