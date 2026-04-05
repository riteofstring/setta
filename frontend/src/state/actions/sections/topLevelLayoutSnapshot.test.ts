import type { Node } from "forks/xyflow/core/types";
import { createTopLevelSectionLayoutDict } from "state/actions/sectionInfos";
import { createCore } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("top-level layout snapshots", () => {
  it("keeps top-level sections even when node internals are missing", () => {
    const sectionA = "section-a";
    const sectionB = "section-b";
    const sections = {
      [sectionA]: createCore({
        id: sectionA,
        name: "Chat",
        variants: ["variant-a"],
        defaultVariant: "variant-a",
      }),
      [sectionB]: createCore({
        id: sectionB,
        name: "Chat",
        variants: ["variant-b"],
        defaultVariant: "variant-b",
      }),
    };
    const existingLayouts = {
      [sectionA]: { x: 0, y: 0, zIndex: 0, w: 120, h: 80 },
      [sectionB]: { x: 50, y: 60, zIndex: 2, w: 300, h: 200 },
    };
    const nodeInternals = new Map<string, Node>([
      [
        sectionA,
        {
          id: sectionA,
          position: { x: 10, y: 20 },
          width: 240,
          height: 180,
          zIndex: 5,
          tempZIndex: 5,
        },
      ],
    ]);

    const snapshot = createTopLevelSectionLayoutDict(
      sections,
      nodeInternals,
      existingLayouts,
    );

    expect(snapshot[sectionA]).toEqual({
      x: 10,
      y: 20,
      zIndex: 5,
      w: 240,
      h: 180,
    });
    expect(snapshot[sectionB]).toEqual(existingLayouts[sectionB]);
  });

  it("clears stale persisted size when a current node reports null dimensions", () => {
    const sectionA = "section-a";
    const sectionB = "section-b";
    const sections = {
      [sectionA]: createCore({
        id: sectionA,
        name: "Chat",
        variants: ["variant-a"],
        defaultVariant: "variant-a",
      }),
      [sectionB]: createCore({
        id: sectionB,
        name: "Chat",
        variants: ["variant-b"],
        defaultVariant: "variant-b",
      }),
    };
    const existingLayouts = {
      [sectionA]: { x: 0, y: 0, zIndex: 0, w: 320, h: 240 },
      [sectionB]: { x: 50, y: 60, zIndex: 2, w: 300, h: 200 },
    };
    const nodeInternals = new Map<string, Node>([
      [
        sectionA,
        {
          id: sectionA,
          position: { x: 10, y: 20 },
          width: null,
          height: null,
          zIndex: 5,
          tempZIndex: 5,
        },
      ],
    ]);

    const snapshot = createTopLevelSectionLayoutDict(
      sections,
      nodeInternals,
      existingLayouts,
    );

    expect(snapshot[sectionA]).toEqual({
      x: 10,
      y: 20,
      zIndex: 5,
      w: null,
      h: null,
    });
    expect(snapshot[sectionB]).toEqual(existingLayouts[sectionB]);
  });

  it("clears mixed partial size when a current node reports only one dimension", () => {
    const sectionA = "section-a";
    const sections = {
      [sectionA]: createCore({
        id: sectionA,
        name: "Chat",
        variants: ["variant-a"],
        defaultVariant: "variant-a",
      }),
    };
    const existingLayouts = {
      [sectionA]: { x: 0, y: 0, zIndex: 0, w: 320, h: 240 },
    };
    const nodeInternals = new Map<string, Node>([
      [
        sectionA,
        {
          id: sectionA,
          position: { x: 10, y: 20 },
          width: 240,
          height: null,
          zIndex: 5,
          tempZIndex: 5,
        },
      ],
    ]);

    const snapshot = createTopLevelSectionLayoutDict(
      sections,
      nodeInternals,
      existingLayouts,
    );

    expect(snapshot[sectionA]).toEqual({
      x: 10,
      y: 20,
      zIndex: 5,
      w: null,
      h: null,
    });
  });
});
