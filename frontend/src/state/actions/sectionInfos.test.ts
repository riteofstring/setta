import { getCurrShownParamIds } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  createProjectConfig,
  createSingletonSections,
  createVariant,
  type ShownParamIds,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("getCurrShownParamIds", () => {
  it("returns pinned and unpinned entries for the active variant", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const shown: ShownParamIds = {
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: ["param-a"],
      },
      unpinned: {
        requiredParamIdsToPaths: { "param-a": ["param-a"] },
        topLevelParamIds: ["param-a"],
      },
    };
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: { [variantId]: shown },
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const pinned = getCurrShownParamIds(state, sectionId, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false);

    expect(pinned.topLevelParamIds).toEqual(["param-a"]);
    expect(unpinned.topLevelParamIds).toEqual(["param-a"]);
  });

  it("uses preview variants when requested", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const previewVariantId = "variant-preview";
    const state = {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      }),
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: ["param-a"] },
          unpinned: {
            requiredParamIdsToPaths: { "param-a": ["param-a"] },
            topLevelParamIds: ["param-a"],
          },
        },
        [previewVariantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: ["param-b"] },
          unpinned: {
            requiredParamIdsToPaths: { "param-b": ["param-b"] },
            topLevelParamIds: ["param-b"],
          },
        },
      },
      previewSectionVariantMap: { [sectionId]: previewVariantId },
      requiredDecodedImages: [],
    } as ZustandProjectState;

    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    expect(unpinned.topLevelParamIds).toEqual(["param-b"]);
  });

});
