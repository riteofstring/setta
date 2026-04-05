import { describe, expect, it } from "vitest";
import { resolveSettingsGraphSubstrateCanarySectionSeedNodes } from "./settingsGraphSubstrateCanarySectionSeedNodes";

describe("settingsGraphSubstrateCanarySectionSeedNodes", () => {
  it("keeps existing shared-node width and height authoritative over local measured-size fallback", () => {
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
      [createSection({ height: 180, sizeAuthority: "sharedNode", width: 260 })],
      { "section-a": { width: 420, height: 315 } },
    );

    expect(nextSeedNodes).toBe(seedNodes);
    expect(nextSeedNodes.get("section-a")).toEqual({
      width: 260,
      height: 180,
      sizeAuthority: "sharedNode",
    });
  });

  it("uses the local measured size to bootstrap a shared-node seed only while width and height are still unresolved", () => {
    const nextSeedNodes = resolveSettingsGraphSubstrateCanarySectionSeedNodes(
      new Map(),
      [createSection({ sizeAuthority: "sharedNode" })],
      { "section-a": { width: 420, height: 315 } },
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
      [createSection({ height: 78, sizeAuthority: "layout", width: 550 })],
      {},
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
      [
        createSection({
          height: 78,
          sizeAuthority: "sectionModel",
          width: 550,
        }),
      ],
      {},
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

function createSection(
  overrides: {
    height?: number | null;
    sizeAuthority?: "layout" | "none" | "sectionModel" | "sharedNode";
    width?: number | null;
  } = {},
) {
  return {
    sectionId: "section-a",
    width: null,
    height: null,
    ...overrides,
  };
}
