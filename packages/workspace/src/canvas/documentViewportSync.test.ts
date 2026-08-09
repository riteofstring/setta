import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceDocument } from "../document/stores";
import { getInitialCanvasViewport, startCanvasViewportDocumentSync } from "./documentViewportSync";
import { initialCanvasState, useReactFlow } from "./store";

beforeEach(() => {
  useWorkspaceDocument.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
});

afterEach(() => {
  useWorkspaceDocument.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
});

describe("getInitialCanvasViewport", () => {
  it("returns the saved document camera without arming fit-on-init", () => {
    useWorkspaceDocument.setState({ viewport: { x: 12, y: -30, zoom: 1.5 } });

    expect(getInitialCanvasViewport()).toEqual({ x: 12, y: -30, zoom: 1.5 });
    expect(useReactFlow.getState().fitViewOnInit).toBe(false);
  });

  it("arms fit-on-init at the identity camera when the document has no saved viewport", () => {
    expect(useWorkspaceDocument.getState().viewport).toBeNull();

    expect(getInitialCanvasViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(useReactFlow.getState().fitViewOnInit).toBe(true);
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(false);
  });
});

describe("startCanvasViewportDocumentSync", () => {
  it("mirrors transform changes into the canonical document viewport", () => {
    useWorkspaceDocument.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    const stop = startCanvasViewportDocumentSync();

    useReactFlow.setState({ transform: [40, -25, 2] });

    expect(useWorkspaceDocument.getState().viewport).toEqual({ x: 40, y: -25, zoom: 2 });
    stop();
  });

  it("clears the fit-on-init flag after an auto-fit and then persists the fitted camera", () => {
    const stop = startCanvasViewportDocumentSync();

    useReactFlow.setState({
      transform: [16, 24, 0.8],
      fitViewOnInit: true,
      fitViewOnInitDone: true,
    });

    // The completed-fit transition clears the flag, and the follow-up event persists the fitted
    // camera immediately (the reference's dispatchViewportUpdateImmediately branch).
    expect(useReactFlow.getState().fitViewOnInit).toBe(false);
    expect(useWorkspaceDocument.getState().viewport).toEqual({ x: 16, y: 24, zoom: 0.8 });
    stop();
  });

  it("stops mirroring after unsubscribe", () => {
    const stop = startCanvasViewportDocumentSync();
    stop();

    useReactFlow.setState({ transform: [10, 10, 1] });

    expect(useWorkspaceDocument.getState().viewport).toBeNull();
  });
});
