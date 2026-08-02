import { getSectionIsHorizontalOrientation } from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createListRootSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  ListRootViewModeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("list root view mode performance", () => {
  it("resolves kanban orientation across repeated calls", () => {
    const sectionId = "list-root-perf";
    const variantId = "variant-perf";
    const implId = "impl-perf";
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {
        [implId]: createListRootSectionImpl({
          id: implId,
          viewMode: ListRootViewModeEnum.kanban,
        }),
      },
      sectionVariants: {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState);

    const iterations = 80_000;
    const start = performance.now();
    let horizontalCount = 0;
    for (let i = 0; i < iterations; i += 1) {
      if (getSectionIsHorizontalOrientation(sectionId)) {
        horizontalCount += 1;
      }
    }
    const elapsedMs = performance.now() - start;

    expect(horizontalCount).toBe(iterations);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
