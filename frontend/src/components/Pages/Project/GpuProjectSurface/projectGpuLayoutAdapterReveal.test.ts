import {
  projectStateWithSections,
  sectionSize,
} from "testUtils/projectGpuLayoutAdapter.test.support";
import {
  createDictSectionImpl,
  createGroupSectionImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { getProjectGpuFlowScene } from "./projectGpuLayoutAdapter";
import { resolveProjectGpuSceneSectionReveal } from "./projectGpuSceneReveal";

describe("project GPU layout adapter reveal", () => {
  it("reveals nested sections through renderer-owned scene scroll offsets", () => {
    const scene = getProjectGpuFlowScene(
      projectStateWithSections({
        sections: [
          {
            id: "group-a",
            impl: createGroupSectionImpl({
              children: ["child-a", "child-b", "child-c"],
              id: "group-a-impl",
              size: sectionSize({ height: "auto", width: "auto" }),
            }),
            parentId: null,
          },
          {
            id: "child-a",
            impl: createDictSectionImpl({
              id: "child-a-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
          {
            id: "child-b",
            impl: createDictSectionImpl({
              id: "child-b-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
          {
            id: "child-c",
            impl: createDictSectionImpl({
              id: "child-c-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
        ],
        topLevelSections: {
          "group-a": { h: 100, w: 200, x: 10, y: 20, zIndex: 1 },
        },
      }),
      { darkMode: false },
    );

    const result = resolveProjectGpuSceneSectionReveal({
      scene,
      scrollOffsets: new Map(),
      sectionId: "child-c",
    });

    expect(result).toMatchObject({
      changed: true,
      parentSectionId: "group-a",
    });
    expect(result.scrollOffsets.get("group-a")).toEqual({
      x: 0,
      y: 66,
    });
  });
});
