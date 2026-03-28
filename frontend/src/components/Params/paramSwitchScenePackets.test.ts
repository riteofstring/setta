import { getTempParamDndId } from "forks/dnd-kit/paramDndState";
import { describe, expect, it } from "vitest";
import { buildVisibleParamScenePackets } from "./paramSwitchScenePackets";

describe("buildVisibleParamScenePackets", () => {
  it("builds semantic row packets for the live filtered param path", () => {
    // Extend the benchmark-shell packet work into the live param rows:
    // visible ancestors stay in order and carry stable group/value semantics.
    expect(
      buildVisibleParamScenePackets({
        paramIds: ["alpha-group", "alpha-leaf", "beta-group", "beta-leaf"],
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
          "beta-leaf": ["beta-group", "beta-leaf"],
        },
        paramFilter: "beta",
        getParamDisplayName: (paramId: string) =>
          (
            {
              "alpha-group": "Alpha Group",
              "alpha-leaf": "Alpha Setting",
              "beta-group": "Beta Group",
              "beta-leaf": "Beta Setting",
            } as Record<string, string>
          )[paramId] ?? paramId,
      }),
    ).toEqual([
      {
        depth: 0,
        id: "beta-group",
        kind: "group",
        label: "Beta Group",
      },
      {
        depth: 1,
        id: "beta-leaf",
        kind: "value",
        label: "Beta Setting",
      },
    ]);
  });

  it("marks temp placeholder rows explicitly when filtering hides real params", () => {
    const tempParamId = getTempParamDndId(
      "beta-leaf::settaParamList::unpinned",
    );

    expect(
      buildVisibleParamScenePackets({
        paramIds: ["alpha-group", "alpha-leaf", tempParamId],
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
        },
        paramFilter: "missing",
        getParamDisplayName: () => "Alpha Setting",
      }),
    ).toEqual([
      {
        depth: 0,
        id: tempParamId,
        kind: "placeholder",
        label: null,
      },
    ]);
  });

  it("keeps nested parent rows typed as groups on the unfiltered live path", () => {
    expect(
      buildVisibleParamScenePackets({
        paramIds: ["parent", "child-group", "child-leaf"],
        requiredParamIdsToPaths: {
          "child-leaf": ["parent", "child-group", "child-leaf"],
        },
        paramFilter: "",
        getParamDisplayName: (paramId: string) =>
          (
            {
              parent: "Parent",
              "child-group": "Child Group",
              "child-leaf": "Child Leaf",
            } as Record<string, string>
          )[paramId] ?? paramId,
      }),
    ).toEqual([
      {
        depth: 0,
        id: "parent",
        kind: "group",
        label: "Parent",
      },
      {
        depth: 1,
        id: "child-group",
        kind: "group",
        label: "Child Group",
      },
      {
        depth: 2,
        id: "child-leaf",
        kind: "value",
        label: "Child Leaf",
      },
    ]);
  });
});
