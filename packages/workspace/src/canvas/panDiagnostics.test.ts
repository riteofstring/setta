/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { useDndState } from "../dnd/dndState";
import { useWorkspaceOptions } from "./options";
import {
  emitWorkspacePanDiagnostic,
  setWorkspacePanDiagnosticLogger,
  type WorkspacePanDiagnosticEvent,
} from "./panDiagnostics";
import { initialCanvasState, useReactFlow } from "./store";

describe("workspace pan diagnostics", () => {
  afterEach(() => {
    setWorkspacePanDiagnosticLogger(null);
    useDndState.getState().reset();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    document.body.innerHTML = "";
  });

  it("captures a JSON-safe wheel, target, handler, and interaction-state snapshot", () => {
    const events: Array<WorkspacePanDiagnosticEvent> = [];
    const section = document.createElement("section");
    section.dataset.sectionId = "clock";
    section.dataset.sectionPresentation = "meta-control";
    section.className = "react-flow__node";
    section.dataset.id = "clock";
    const target = document.createElement("button");
    target.className = "nopan nowheel setta-manual-wheel setta-native-wheel-y";
    section.appendChild(target);
    document.body.appendChild(section);

    useReactFlow.setState({
      transform: [12, 34, 1.25],
      paneDragging: true,
      viewportInteractionActive: true,
    });
    useDndState.setState({
      activeId: "clock",
      isMovingFree: true,
    });
    setWorkspacePanDiagnosticLogger((event) => events.push(event));

    const sourceEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 70,
      deltaY: 5,
    });
    Object.defineProperty(sourceEvent, "target", { value: target });
    emitWorkspacePanDiagnostic({
      phase: "wheel-disposition",
      sourceEvent,
      details: { handler: "pan-on-scroll", targetDisposition: "manual" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sequence: 1,
      phase: "wheel-disposition",
      source: {
        type: "wheel",
        cancelable: true,
        deltaX: 70,
        deltaY: 5,
      },
      target: {
        tagName: "button",
        sectionId: "clock",
        sectionPresentation: "meta-control",
        nodeId: "clock",
        noPan: true,
        noWheel: true,
        manualWheel: true,
        nativeVerticalWheel: true,
      },
      state: {
        transform: [12, 34, 1.25],
        paneDragging: true,
        viewportInteractionActive: true,
        activeDndId: "clock",
        dndIsMovingFree: true,
        d3SelectionPresent: false,
        installedWheelHandlerPresent: false,
      },
      details: { handler: "pan-on-scroll", targetDisposition: "manual" },
    });
    expect(() => JSON.stringify(events[0])).not.toThrow();
  });

  it("does no snapshot work when no logger is installed", () => {
    expect(() =>
      emitWorkspacePanDiagnostic({
        phase: "interaction-reset",
      }),
    ).not.toThrow();
  });
});
