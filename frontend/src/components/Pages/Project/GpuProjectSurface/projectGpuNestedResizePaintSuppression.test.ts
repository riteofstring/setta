import { describe, expect, it } from "vitest";
import {
  createProjectConfig,
  createSingleConfig,
  createTopLevelSectionLayout,
} from "utils/generatedTypes";
import {
  resolveProjectGpuNestedResizePaintSuppressionNodeIds,
  selectActiveResizeSectionIds,
} from "./projectGpuNestedResizePaintSuppression";

describe("project GpuFlow nested resize paint suppression", () => {
  it("selects active resize section ids deterministically", () => {
    expect(
      selectActiveResizeSectionIds({
        childB: "start",
        childA: "start",
        childC: "end",
      }),
    ).toEqual(["childA", "childB"]);
  });

  it("maps nested active resize sections to top-level GpuFlow nodes", () => {
    const projectState = createSingleConfig({
      parentSectionMap: {
        childA: "groupA",
        childB: "groupA",
        groupA: "topA",
        topA: null,
        topB: null,
      },
      projectConfig: createProjectConfig({
        topLevelSections: {
          topA: createTopLevelSectionLayout(),
          topB: createTopLevelSectionLayout(),
        },
      }),
    });

    expect(
      resolveProjectGpuNestedResizePaintSuppressionNodeIds(projectState, [
        "childB",
        "topB",
        "childA",
      ]),
    ).toEqual(["topA"]);
  });

  it("does not suppress unknown or non-rendered ancestors", () => {
    const projectState = createSingleConfig({
      parentSectionMap: {
        childA: "missingTop",
        missingTop: null,
        topA: null,
      },
      projectConfig: createProjectConfig({
        topLevelSections: {
          topA: createTopLevelSectionLayout(),
        },
      }),
    });

    expect(
      resolveProjectGpuNestedResizePaintSuppressionNodeIds(projectState, [
        "childA",
      ]),
    ).toEqual([]);
  });
});
