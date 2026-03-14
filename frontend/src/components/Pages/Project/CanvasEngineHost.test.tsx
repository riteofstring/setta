import { describe, expect, it } from "vitest";
import { createProjectConfig } from "utils/generatedTypes";

import { createCanvasEngineHostSnapshotResult } from "./CanvasEngineHost";

describe("CanvasEngineHost", () => {
  it("builds scene counts for the scaffold host from project state inputs", () => {
    const projectConfig = createProjectConfig({
      id: "project-config-1",
    });
    projectConfig.activeIds = ["section-b"];
    projectConfig.topLevelSections = {
      "section-a": {
        x: 0,
        y: 0,
        zIndex: 0,
        w: 320,
        h: 200,
      },
      "section-b": {
        x: 420,
        y: 80,
        zIndex: 1,
        w: 360,
        h: 220,
      },
    };
    projectConfig.edges = [
      {
        id: "edge-data-1",
        sourceSectionId: "section-a",
        sourceVariantId: "variant-a",
        sourcePortId: "out-a",
        targetSectionId: "section-b",
        targetVariantId: "variant-b",
        targetPortId: "in-b",
        type: "default",
        label: null,
        style: null,
        animated: false,
        hidden: false,
        zIndex: 0,
        data: null,
        selected: false,
      },
    ];
    projectConfig.agenticEdges = [
      {
        id: "edge-agentic-1",
        sourceSectionId: "section-b",
        targetSectionId: "section-a",
        kind: "chat_chat",
        contextMode: "reference_only",
        style: null,
        hidden: false,
        zIndex: 0,
        selected: false,
      },
    ];
    const snapshotResult = createCanvasEngineHostSnapshotResult({
      topLevelSections: projectConfig.topLevelSections,
      activeSectionIds: projectConfig.activeIds,
      edges: projectConfig.edges,
      agenticEdges: projectConfig.agenticEdges,
      edgeHandlePositions: {},
      sectionEdgePortsBySectionId: {},
    });

    expect(snapshotResult.totalRectCount).toBe(2);
    expect(snapshotResult.totalDataEdgeCount).toBe(1);
    expect(snapshotResult.totalAgenticEdgeCount).toBe(1);
    expect(snapshotResult.snapshot.rects.map((rect) => rect.id)).toEqual([
      "section-a",
      "section-b",
    ]);
  });
});
