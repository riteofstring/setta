import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import { syncSettingsGraphSubstrateCanaryNodes } from "./settingsGraphSubstrateCanaryNodeSync";
import { resolveSettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";

describe("settingsGraphSubstrateCanaryNodeSync", () => {
  it("syncs the authoritative canary scene snapshot into shared node internals", () => {
    const nodeInternals = new Map<string, Node>([
      [
        "section-a",
        {
          id: "section-a",
          position: { x: 12, y: 18 },
          width: null,
          height: null,
          zIndex: 1,
          tempZIndex: 7,
          type: "Code",
          style: { background: "#111111" },
        },
      ],
    ]);

    // Layout-resolved size should stay authoritative when it already exists.
    const sceneSnapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 500, y: 300 },
          width: 240,
          height: 160,
          zIndex: 4,
          tempZIndex: 4,
          positionAndSizeLocked: false,
        },
        {
          sectionId: "section-b",
          position: { x: 120, y: 80 },
          width: null,
          height: null,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 360, height: 210 },
        "section-b": { width: 280, height: 190 },
      },
      null,
    );
    const nextNodeInternals = syncSettingsGraphSubstrateCanaryNodes(
      nodeInternals,
      sceneSnapshot,
    );

    expect(nextNodeInternals).not.toBe(nodeInternals);
    expect(nextNodeInternals.get("section-a")).toEqual({
      id: "section-a",
      position: { x: 500, y: 300 },
      width: 240,
      height: 160,
      zIndex: 4,
      tempZIndex: 7,
      type: "Code",
      style: { background: "#111111" },
    });
    expect(nextNodeInternals.get("section-b")).toEqual({
      id: "section-b",
      position: { x: 120, y: 80 },
      width: 280,
      height: 190,
      zIndex: 2,
      tempZIndex: 2,
      type: undefined,
      style: undefined,
    });
  });

  it("returns the same map when the shared node internals already match the canary", () => {
    const nodeInternals = new Map<string, Node>([
      [
        "section-a",
        {
          id: "section-a",
          position: { x: 500, y: 300 },
          width: 240,
          height: 160,
          zIndex: 4,
          tempZIndex: 7,
        },
      ],
    ]);

    // When the shared internals already match the authoritative snapshot, no
    // replacement map should be allocated.
    const sceneSnapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 500, y: 300 },
          width: 240,
          height: 160,
          zIndex: 4,
          tempZIndex: 4,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 360, height: 210 },
      },
      null,
    );
    const nextNodeInternals = syncSettingsGraphSubstrateCanaryNodes(
      nodeInternals,
      sceneSnapshot,
    );

    expect(nextNodeInternals).toBe(nodeInternals);
  });
});
