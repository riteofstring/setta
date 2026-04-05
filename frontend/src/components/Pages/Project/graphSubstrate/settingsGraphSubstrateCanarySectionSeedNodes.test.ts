import { describe, expect, it } from "vitest";
import { resolveSettingsGraphSubstrateCanarySectionSeedNodes } from "./settingsGraphSubstrateCanarySectionSeedNodes";

describe("settingsGraphSubstrateCanarySectionSeedNodes", () => {
  it("keeps existing shared-node width and height authoritative over local resolved-size fallback", () => {
    const seedNodes = new Map<
      string,
      | {
          height: number;
          sizeAuthority: "sharedNode";
          width: number;
        }
      | undefined
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
      seedNodes,
      {
        sections: [
          {
            sectionId: "section-a",
            position: { x: 120, y: 80 },
            renderedPosition: { x: 120, y: 80 },
            width: 260,
            height: 180,
            resolvedSize: { width: 420, height: 315 },
            sceneBoundsSize: { width: 260, height: 180 },
            sizeAuthority: "sharedNode",
            zIndex: 2,
            tempZIndex: 2,
            positionAndSizeLocked: false,
          },
        ],
      },
    );

    expect(nextSeedNodes).toBe(seedNodes);
    expect(nextSeedNodes.get("section-a")).toEqual({
      width: 260,
      height: 180,
      sizeAuthority: "sharedNode",
    });
  });

  it("uses the local resolved size to bootstrap a shared-node seed only while width and height are still unresolved", () => {
    const nextSeedNodes = resolveSettingsGraphSubstrateCanarySectionSeedNodes(
      new Map(),
      {
        sections: [
          {
            sectionId: "section-a",
            position: { x: 120, y: 80 },
            renderedPosition: { x: 120, y: 80 },
            width: null,
            height: null,
            resolvedSize: { width: 420, height: 315 },
            sceneBoundsSize: null,
            sizeAuthority: "sharedNode",
            zIndex: 2,
            tempZIndex: 2,
            positionAndSizeLocked: false,
          },
        ],
      },
    );

    expect(nextSeedNodes.get("section-a")).toEqual({
      width: 420,
      height: 315,
      sizeAuthority: "sharedNode",
    });
  });

  it("drops a stale shared-node seed when layout authority takes over", () => {
    const seedNodes = new Map<
      string,
      | {
          height: number;
          sizeAuthority: "sharedNode";
          width: number;
        }
      | undefined
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
      seedNodes,
      {
        sections: [
          {
            sectionId: "section-a",
            position: { x: 120, y: 80 },
            renderedPosition: { x: 120, y: 80 },
            width: 550,
            height: 78,
            resolvedSize: { width: 550, height: 78 },
            sceneBoundsSize: { width: 550, height: 78 },
            sizeAuthority: "layout",
            zIndex: 2,
            tempZIndex: 2,
            positionAndSizeLocked: false,
          },
        ],
      },
    );

    expect(nextSeedNodes).not.toBe(seedNodes);
    expect(nextSeedNodes.has("section-a")).toBe(false);
  });

  it("drops a stale shared-node seed once the current scene resolves non-shared authority", () => {
    const seedNodes = new Map<
      string,
      | {
          height: number;
          sizeAuthority: "sharedNode";
          width: number;
        }
      | undefined
    >([
      [
        "section-a",
        {
          width: 260,
          height: 180,
          sizeAuthority: "sharedNode",
        },
      ],
      [
        "section-b",
        {
          width: 420,
          height: 315,
          sizeAuthority: "sharedNode",
        },
      ],
    ]);

    const nextSeedNodes = resolveSettingsGraphSubstrateCanarySectionSeedNodes(
      seedNodes,
      {
        sections: [
          {
            sectionId: "section-a",
            position: { x: 120, y: 80 },
            renderedPosition: { x: 120, y: 80 },
            width: 550,
            height: 78,
            resolvedSize: { width: 550, height: 78 },
            sceneBoundsSize: { width: 550, height: 78 },
            sizeAuthority: "sectionModel",
            zIndex: 2,
            tempZIndex: 2,
            positionAndSizeLocked: false,
          },
        ],
      },
    );

    expect(nextSeedNodes).not.toBe(seedNodes);
    expect(nextSeedNodes.has("section-a")).toBe(false);
    expect(nextSeedNodes.get("section-b")).toEqual({
      width: 420,
      height: 315,
      sizeAuthority: "sharedNode",
    });
  });
});
