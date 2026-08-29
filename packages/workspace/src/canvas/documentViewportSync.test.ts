import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import type { ZoomTransform } from "d3-zoom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceDocument } from "../document/types";
import {
  applyLoadedDocumentViewport,
  armLoadedDocumentFitView,
  getInitialCanvasViewport,
  startCanvasViewportDocumentSync,
} from "./documentViewportSync";
import { initialCanvasState, useReactFlow } from "./store";
import type { ReactFlowState } from "./types";

beforeEach(() => {
  testWorkspace.document.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
});

afterEach(() => {
  testWorkspace.document.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
});

function mountFakeZoomRuntime() {
  const applied: Array<ZoomTransform> = [];
  const fakeZoom = {
    constrain: () => (transform: ZoomTransform) => transform,
    transform: (_selection: unknown, transform: ZoomTransform) => {
      applied.push(transform);
    },
  } as unknown as NonNullable<ReactFlowState["d3Zoom"]>;
  const fakeSelection = {} as NonNullable<ReactFlowState["d3Selection"]>;
  testWorkspace.reactFlow.setState({
    d3Zoom: fakeZoom,
    d3Selection: fakeSelection,
    width: 800,
    height: 600,
  });
  return applied;
}

describe("getInitialCanvasViewport", () => {
  it("returns the saved document camera without arming fit-on-init", () => {
    testWorkspace.document.setState({ viewport: { x: 12, y: -30, zoom: 1.5 } });

    expect(getInitialCanvasViewport(testWorkspace.host)).toEqual({
      x: 12,
      y: -30,
      zoom: 1.5,
    });
    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
  });

  it("normalizes stale armed fit flags in the saved-camera branch", () => {
    testWorkspace.reactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
    testWorkspace.document.setState({ viewport: { x: 5, y: 6, zoom: 2 } });

    expect(getInitialCanvasViewport(testWorkspace.host)).toEqual({
      x: 5,
      y: 6,
      zoom: 2,
    });
    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
    expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(true);
  });

  it("arms fit-on-init at the identity camera when the document has no saved viewport", () => {
    expect(testWorkspace.document.getState().viewport).toBeNull();

    expect(getInitialCanvasViewport(testWorkspace.host)).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(true);
    expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(false);
  });
});

describe("startCanvasViewportDocumentSync", () => {
  it("mirrors transform changes into the canonical document viewport", () => {
    testWorkspace.document.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    const stop = startCanvasViewportDocumentSync(testWorkspace.host);

    testWorkspace.reactFlow.setState({ transform: [40, -25, 2] });

    expect(testWorkspace.document.getState().viewport).toEqual({
      x: 40,
      y: -25,
      zoom: 2,
    });
    stop();
  });

  it("notifies the document-change callback for each mirrored change", () => {
    const reported: Array<WorkspaceDocument> = [];
    testWorkspace.host.subscribe((document) => {
      reported.push(document);
    });
    const stop = startCanvasViewportDocumentSync(testWorkspace.host);

    testWorkspace.reactFlow.setState({ transform: [40, -25, 2] });

    expect(reported).toHaveLength(1);
    expect(reported[0]?.viewport).toEqual({ x: 40, y: -25, zoom: 2 });
    stop();
  });

  it("clears the fit-on-init flag after an auto-fit and then persists the fitted camera", () => {
    const stop = startCanvasViewportDocumentSync(testWorkspace.host);

    testWorkspace.reactFlow.setState({
      transform: [16, 24, 0.8],
      fitViewOnInit: true,
      fitViewOnInitDone: true,
    });

    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
    expect(testWorkspace.document.getState().viewport).toEqual({
      x: 16,
      y: 24,
      zoom: 0.8,
    });
    stop();
  });

  it("stops mirroring after unsubscribe", () => {
    const stop = startCanvasViewportDocumentSync(testWorkspace.host);
    stop();

    testWorkspace.reactFlow.setState({ transform: [10, 10, 1] });

    expect(testWorkspace.document.getState().viewport).toBeNull();
  });
});

describe("armLoadedDocumentFitView", () => {
  it("arms fit-on-init on a mounted canvas for a document without a saved camera", () => {
    mountFakeZoomRuntime();
    armLoadedDocumentFitView(testWorkspace.host, null);

    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(true);
    expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(false);
  });

  it("does nothing for a saved camera or an unmounted canvas", () => {
    armLoadedDocumentFitView(testWorkspace.host, null);
    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);

    mountFakeZoomRuntime();
    armLoadedDocumentFitView(testWorkspace.host, { x: 1, y: 2, zoom: 1 });
    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
  });
});

describe("applyLoadedDocumentViewport", () => {
  it("pushes the loaded camera through d3-zoom and cancels any pending fit", () => {
    const applied = mountFakeZoomRuntime();
    testWorkspace.reactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });

    applyLoadedDocumentViewport(testWorkspace.host, {
      x: 100,
      y: -50,
      zoom: 1.5,
    });

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ x: 100, y: -50, k: 1.5 });
    expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
    expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(true);
  });

  it("clamps the loaded zoom to the option limits", () => {
    const applied = mountFakeZoomRuntime();

    applyLoadedDocumentViewport(testWorkspace.host, { x: 0, y: 0, zoom: 500 });

    expect(applied[0]?.k).toBeLessThan(500);
  });

  it("does nothing for a missing camera or an unmounted canvas", () => {
    applyLoadedDocumentViewport(testWorkspace.host, { x: 1, y: 2, zoom: 1 });
    expect(testWorkspace.reactFlow.getState().fitViewOnInitDone).toBe(false);

    const applied = mountFakeZoomRuntime();
    applyLoadedDocumentViewport(testWorkspace.host, null);
    expect(applied).toHaveLength(0);
  });
});
