import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import { syncSettingsGraphSubstrateCanaryNodes } from "./settingsGraphSubstrateCanaryNodeSync";
import { resolveSettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";

describe("settingsGraphSubstrateCanaryNodeSync", () => {
  it("syncs layout and section-model sizes authoritatively while leaving measured fallback only on shared-node sections", () => {
    const nodeInternals = new Map<string, Node>([
      [
        "section-a",
        {
          id: "section-a",
          position: { x: 12, y: 18 },
          width: null,
          height: null,
          sizeAuthority: "none",
          zIndex: 1,
          tempZIndex: 7,
          type: "Code",
          style: { background: "#111111" },
        },
      ],
    ]);

    // Layout size should stay authoritative for sections that already have
    // current project geometry, while sections missing layout size can still
    // fall back to shared measured DOM size.
    const sceneSnapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 500, y: 300 },
          width: 240,
          height: 160,
          sizeAuthority: "layout",
          zIndex: 4,
          tempZIndex: 4,
          positionAndSizeLocked: false,
        },
        {
          sectionId: "section-b",
          position: { x: 120, y: 80 },
          width: 550,
          height: 78,
          sizeAuthority: "sectionModel",
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
        {
          sectionId: "section-c",
          position: { x: 260, y: 140 },
          width: 260,
          height: 180,
          sizeAuthority: "sharedNode",
          zIndex: 3,
          tempZIndex: 3,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 360, height: 210 },
        "section-b": { width: 280, height: 190 },
        "section-c": { width: 320, height: 220 },
      },
      null,
      "section-a",
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
      sizeAuthority: "layout",
      zIndex: 4,
      tempZIndex: 1004,
      type: "Code",
      style: { background: "#111111" },
    });
    expect(nextNodeInternals.get("section-b")).toEqual({
      id: "section-b",
      position: { x: 120, y: 80 },
      width: 550,
      height: 78,
      sizeAuthority: "sectionModel",
      zIndex: 2,
      tempZIndex: 2,
      type: undefined,
      style: undefined,
    });
    expect(nextNodeInternals.get("section-c")).toEqual({
      id: "section-c",
      position: { x: 260, y: 140 },
      width: 320,
      height: 220,
      sizeAuthority: "sharedNode",
      zIndex: 3,
      tempZIndex: 3,
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
          sizeAuthority: "layout",
          zIndex: 4,
          tempZIndex: 1004,
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
          sizeAuthority: "layout",
          zIndex: 4,
          tempZIndex: 4,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 360, height: 210 },
      },
      null,
      "section-a",
    );
    const nextNodeInternals = syncSettingsGraphSubstrateCanaryNodes(
      nodeInternals,
      sceneSnapshot,
    );

    expect(nextNodeInternals).toBe(nodeInternals);
  });

  it("clears stale measured size when the current scene snapshot has no authoritative size", () => {
    const nodeInternals = new Map<string, Node>([
      [
        "section-a",
        {
          id: "section-a",
          position: { x: 12, y: 18 },
          width: 360,
          height: 210,
          sizeAuthority: "sectionModel",
          zIndex: 1,
          tempZIndex: 7,
          type: "Code",
          style: { background: "#111111" },
        },
      ],
    ]);

    // When the canary no longer has layout or measured geometry, do not keep
    // reasserting a stale previously measured size through shared node state.
    const sceneSnapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 500, y: 300 },
          width: null,
          height: null,
          sizeAuthority: "none",
          zIndex: 4,
          tempZIndex: 4,
          positionAndSizeLocked: false,
        },
      ],
      {},
      null,
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
      width: null,
      height: null,
      sizeAuthority: "none",
      zIndex: 4,
      tempZIndex: 4,
      type: "Code",
      style: { background: "#111111" },
    });
  });
});
