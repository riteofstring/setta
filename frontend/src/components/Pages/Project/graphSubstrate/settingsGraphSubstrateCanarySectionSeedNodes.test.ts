import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import {
  resolveSettingsGraphSubstrateCanaryBootstrapSeedNodes,
  resolveSettingsGraphSubstrateCanarySectionSeedNodes,
} from "./settingsGraphSubstrateCanarySectionSeedNodes";

describe("settingsGraphSubstrateCanarySectionSeedNodes", () => {
  it("keeps only explicit shared-node seeds when bootstrapping from global node internals", () => {
    const nodeInternals = new Map<
      string,
      Pick<Node, "height" | "sizeAuthority" | "width"> | undefined
    >([
      [
        "shared-section",
        {
          width: 260,
          height: 180,
          sizeAuthority: "sharedNode",
        },
      ],
      [
        "section-model-section",
        {
          width: 550,
          height: 78,
          sizeAuthority: "sectionModel",
        },
      ],
      [
        "empty-section",
        {
          width: null,
          height: null,
          sizeAuthority: "sharedNode",
        },
      ],
    ]);

    expect(
      resolveSettingsGraphSubstrateCanaryBootstrapSeedNodes(nodeInternals),
    ).toEqual(
      new Map([
        [
          "shared-section",
          {
            width: 260,
            height: 180,
            sizeAuthority: "sharedNode",
          },
        ],
      ]),
    );
  });

  it("prefers the previous canary shared-node resolved size over stale global node internals", () => {
    const nodeInternals = new Map<
      string,
      Pick<Node, "height" | "sizeAuthority" | "width"> | undefined
    >([
      [
        "section-a",
        {
          width: 260,
          height: 180,
          sizeAuthority: "sharedNode",
        },
      ],
    ]);

    const nextSeedNodes = resolveSettingsGraphSubstrateCanarySectionSeedNodes(
      nodeInternals,
      {
        sections: [
          {
            sectionId: "section-a",
            position: { x: 120, y: 80 },
            renderedPosition: { x: 120, y: 80 },
            width: 260,
            height: 180,
            resolvedSize: { width: 420, height: 315 },
            sizeAuthority: "sharedNode",
            zIndex: 2,
            tempZIndex: 2,
            positionAndSizeLocked: false,
          },
        ],
      },
    );

    expect(nextSeedNodes).not.toBe(nodeInternals);
    expect(nextSeedNodes.get("section-a")).toEqual({
      width: 420,
      height: 315,
      sizeAuthority: "sharedNode",
    });
  });

  it("leaves non-shared scene sections on the existing node-internals seed path", () => {
    const nodeInternals = new Map<
      string,
      Pick<Node, "height" | "sizeAuthority" | "width"> | undefined
    >([
      [
        "section-a",
        {
          width: 260,
          height: 180,
          sizeAuthority: "sharedNode",
        },
      ],
    ]);

    const nextSeedNodes = resolveSettingsGraphSubstrateCanarySectionSeedNodes(
      nodeInternals,
      {
        sections: [
          {
            sectionId: "section-a",
            position: { x: 120, y: 80 },
            renderedPosition: { x: 120, y: 80 },
            width: 550,
            height: 78,
            resolvedSize: { width: 550, height: 78 },
            sizeAuthority: "sectionModel",
            zIndex: 2,
            tempZIndex: 2,
            positionAndSizeLocked: false,
          },
        ],
      },
    );

    expect(nextSeedNodes).toBe(nodeInternals);
  });
});
