import { HandlePosition } from "forks/xyflow/core/types";
import {
  useEdgeHandleRegistry,
  useProjectState,
  useSettings,
  type EdgeHandleRecord,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig, createSettingsState } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeEdgeHandleKey,
  registerEdgeHandle,
  registerEdgeHandlesWithSharedElement,
} from "./edgeHandles";

function createHandleElement() {
  const getBoundingClientRectSpy = vi.fn().mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 120,
    bottom: 60,
    width: 20,
    height: 10,
    toJSON: () => ({}),
  } as DOMRect);
  const element = {
    getBoundingClientRect: getBoundingClientRectSpy,
  } as unknown as HTMLElement;
  return {
    element,
    getBoundingClientRectSpy,
  };
}

function setProjectEdges(edgeCount: number) {
  let edges: Array<{
    sourceSectionId: string;
    sourceVariantId: string;
    sourcePortId: string;
    targetSectionId: string;
    targetVariantId: string;
    targetPortId: string;
  }> = [];
  if (edgeCount > 0) {
    edges = [
      {
        sourceSectionId: "source-section",
        sourceVariantId: "source-variant",
        sourcePortId: "source-port",
        targetSectionId: "target-section",
        targetVariantId: "target-variant",
        targetPortId: "target-port",
      },
    ];
  }
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-id",
      edges,
    });
  });
}

function createRecord(element: HTMLElement): EdgeHandleRecord {
  return {
    sectionId: "section-a",
    portId: "port-a",
    type: "source",
    side: HandlePosition.Right,
    element,
  };
}

describe("edge handle position updates", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    setProjectEdges(0);
  });

  it("stores handles without geometry reads when the project has no edges", () => {
    // Ensures tab switches with zero edges avoid forced layout work.
    const { element, getBoundingClientRectSpy } = createHandleElement();
    const record = createRecord(element);

    const key = registerEdgeHandle(record);

    expect(getBoundingClientRectSpy).not.toHaveBeenCalled();
    expect(useEdgeHandleRegistry.getState().handles[key]).toEqual(record);
    expect(useEdgeHandleRegistry.getState().positions[key]).toBeUndefined();
  });

  it("computes handle positions when edges exist", () => {
    // Validates that edge rendering still gets concrete handle coordinates.
    setProjectEdges(1);
    const { element, getBoundingClientRectSpy } = createHandleElement();
    const record = createRecord(element);

    const key = registerEdgeHandle(record);

    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(1);
    expect(useEdgeHandleRegistry.getState().positions[key]).toMatchObject({
      sectionId: "section-a",
      portId: "port-a",
      type: "source",
      side: HandlePosition.Right,
      x: 110,
      y: 55,
    });
  });

  it("registers shared handles without geometry reads when edges are absent", () => {
    // Confirms shared minimized-handle registration keeps the same optimization.
    const { element, getBoundingClientRectSpy } = createHandleElement();

    registerEdgeHandlesWithSharedElement({
      sectionId: "section-b",
      portIds: ["input-a", "input-b"],
      type: "target",
      side: HandlePosition.Left,
      element,
    });

    expect(getBoundingClientRectSpy).not.toHaveBeenCalled();
    const firstKey = makeEdgeHandleKey("section-b", "input-a", "target");
    const secondKey = makeEdgeHandleKey("section-b", "input-b", "target");
    expect(useEdgeHandleRegistry.getState().handles[firstKey]).toBeTruthy();
    expect(useEdgeHandleRegistry.getState().handles[secondKey]).toBeTruthy();
    expect(useEdgeHandleRegistry.getState().positions[firstKey]).toBeUndefined();
    expect(useEdgeHandleRegistry.getState().positions[secondKey]).toBeUndefined();
  });
});
