import { describe, expect, it } from "vitest";

import type { CanvasEngineEdgeHandlePosition } from "canvas-engine/sceneAdapter";
import type { ProjectConfig } from "utils/generatedTypes";

import {
  areEdgeHandlePositionMapsEqual,
  buildConnectedDataEdgeHandleKeys,
  buildDataEdgeHandleKey,
  pickEdgeHandlePositionsByKeys,
} from "./edgeHandlePositionSelectors";

describe("edgeHandlePositionSelectors", () => {
  it("builds deterministic unique handle keys from connected data edges", () => {
    // This verifies we only subscribe to handles that are actually referenced by data edges.
    const edges: ProjectConfig["edges"] = [
      createDataEdge("edge-1", "section-a", "section-b", {
        sourcePortId: "out-a",
        targetPortId: "in-b",
      }),
      createDataEdge("edge-2", "section-a", "section-c", {
        sourcePortId: "out-a",
        targetPortId: "in-c",
      }),
      createDataEdge("edge-3", "section-d", "section-b", {
        sourcePortId: "out-d",
        targetPortId: "in-b",
      }),
    ];

    expect(buildConnectedDataEdgeHandleKeys(edges)).toEqual([
      "section-a:out-a:source",
      "section-b:in-b:target",
      "section-c:in-c:target",
      "section-d:out-d:source",
    ]);
  });

  it("picks only requested handle positions that exist in the registry", () => {
    // This verifies the selector excludes unrelated registry entries.
    const source = createEdgeHandlePosition({
      sectionId: "section-a",
      portId: "out-a",
      type: "source",
      x: 100,
      y: 110,
    });
    const target = createEdgeHandlePosition({
      sectionId: "section-b",
      portId: "in-b",
      type: "target",
      x: 200,
      y: 210,
    });
    const unrelated = createEdgeHandlePosition({
      sectionId: "section-z",
      portId: "out-z",
      type: "source",
      x: 900,
      y: 910,
    });
    const positions: Record<string, CanvasEngineEdgeHandlePosition> = {
      [buildDataEdgeHandleKey("section-a", "out-a", "source")]: source,
      [buildDataEdgeHandleKey("section-b", "in-b", "target")]: target,
      [buildDataEdgeHandleKey("section-z", "out-z", "source")]: unrelated,
    };

    expect(
      pickEdgeHandlePositionsByKeys(positions, [
        "section-a:out-a:source",
        "section-b:in-b:target",
        "missing:port:target",
      ]),
    ).toEqual({
      "section-a:out-a:source": source,
      "section-b:in-b:target": target,
    });
  });

  it("compares selected handle maps by key membership and value identity", () => {
    // This verifies equality remains true when selected handle entries are unchanged.
    const source = createEdgeHandlePosition({
      sectionId: "section-a",
      portId: "out-a",
      type: "source",
      x: 100,
      y: 110,
    });
    const target = createEdgeHandlePosition({
      sectionId: "section-b",
      portId: "in-b",
      type: "target",
      x: 200,
      y: 210,
    });
    const left = {
      "section-a:out-a:source": source,
      "section-b:in-b:target": target,
    };
    const rightWithSameRefs = {
      "section-a:out-a:source": source,
      "section-b:in-b:target": target,
    };
    const rightWithChangedSource = {
      "section-a:out-a:source": createEdgeHandlePosition({
        sectionId: "section-a",
        portId: "out-a",
        type: "source",
        x: 101,
        y: 111,
      }),
      "section-b:in-b:target": target,
    };

    expect(areEdgeHandlePositionMapsEqual(left, rightWithSameRefs)).toBe(true);
    expect(areEdgeHandlePositionMapsEqual(left, rightWithChangedSource)).toBe(
      false,
    );
    expect(
      areEdgeHandlePositionMapsEqual(left, {
        "section-a:out-a:source": source,
      }),
    ).toBe(false);
  });
});

function createDataEdge(
  id: string,
  sourceSectionId: string,
  targetSectionId: string,
  overrides?: Partial<ProjectConfig["edges"][number]>,
): ProjectConfig["edges"][number] {
  return {
    id,
    sourceSectionId,
    sourceVariantId: `${sourceSectionId}-variant`,
    sourcePortId: `${sourceSectionId}-port`,
    targetSectionId,
    targetVariantId: `${targetSectionId}-variant`,
    targetPortId: `${targetSectionId}-port`,
    type: "default",
    label: null,
    style: null,
    animated: false,
    hidden: false,
    zIndex: 0,
    data: null,
    selected: false,
    ...overrides,
  };
}

function createEdgeHandlePosition({
  sectionId,
  portId,
  type,
  x,
  y,
}: {
  sectionId: string;
  portId: string;
  type: "source" | "target";
  x: number;
  y: number;
}): CanvasEngineEdgeHandlePosition {
  return {
    sectionId,
    portId,
    type,
    x,
    y,
  };
}
