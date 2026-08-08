import { type ZustandProjectState } from "state/definitions";
import {
  createProjectConfig,
  createTopLevelSectionLayout,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { orderSectionIdsByParent } from "./sectionSelection";

function createSelectionState(
  topLevelSections: Record<string, TopLevelSectionLayout>,
): ZustandProjectState {
  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      topLevelSections,
    }),
    parentSectionMap: {},
  } as ZustandProjectState;
}

describe("orderSectionIdsByParent", () => {
  it("orders top-level sections by layout coordinates, z-index, and id", () => {
    const state = createSelectionState({
      gamma: createTopLevelSectionLayout({ y: 5, x: 10, zIndex: 1 }),
      alpha: createTopLevelSectionLayout({ y: 0, x: 10, zIndex: 2 }),
      beta: createTopLevelSectionLayout({ y: 0, x: 10, zIndex: 1 }),
      delta: createTopLevelSectionLayout({ y: 0, x: 5, zIndex: 9 }),
    });

    expect(
      orderSectionIdsByParent(state, null, ["gamma", "alpha", "beta", "delta"]),
    ).toEqual(["delta", "beta", "alpha", "gamma"]);
  });

  it("keeps sections without layouts at the end and orders them by id", () => {
    const state = createSelectionState({
      "laid-out": createTopLevelSectionLayout({ y: 1, x: 1, zIndex: 0 }),
    });

    expect(
      orderSectionIdsByParent(state, null, ["zeta", "laid-out", "alpha"]),
    ).toEqual(["laid-out", "alpha", "zeta"]);
  });
});
