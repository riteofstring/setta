import { beforeEach, describe, expect, it } from "vitest";

import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createGroupSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultChatSectionImpl,
  createUserDefaultGroupSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { getCurrEffectiveSectionImpl } from "./sectionEffectiveImpls";
import {
  getHighestAncestor,
  getSectionDescendants,
  resetSectionsToDefaultVersions,
  setSectionChildren,
} from "./sectionHierarchy";

function buildHierarchyState(): ZustandProjectState {
  const rootSectionId = "root-section";
  const childSectionId = "child-section";
  const grandchildSectionId = "grandchild-section";
  const rootVariantId = "root-variant";
  const childVariantId = "child-variant";
  const grandchildVariantId = "grandchild-variant";
  const rootImplId = "root-impl";
  const childImplId = "child-impl";
  const grandchildImplId = "grandchild-impl";

  return {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [rootSectionId]: rootVariantId,
        [childSectionId]: childVariantId,
        [grandchildSectionId]: grandchildVariantId,
      },
    }),
    sections: {
      [rootSectionId]: createCore({
        id: rootSectionId,
        variants: [rootVariantId],
        defaultVariant: rootVariantId,
      }),
      [childSectionId]: createCore({
        id: childSectionId,
        variants: [childVariantId],
        defaultVariant: childVariantId,
      }),
      [grandchildSectionId]: createCore({
        id: grandchildSectionId,
        variants: [grandchildVariantId],
        defaultVariant: grandchildVariantId,
      }),
    },
    sectionImpls: {
      [rootImplId]: createGroupSectionImpl(
        createUserDefaultGroupSectionImpl(),
        {
          id: rootImplId,
          children: [childSectionId],
        },
      ),
      [childImplId]: createGroupSectionImpl(
        createUserDefaultGroupSectionImpl(),
        {
          id: childImplId,
          children: [grandchildSectionId],
        },
      ),
      [grandchildImplId]: createChatSectionImpl(
        createUserDefaultChatSectionImpl(),
        {
          id: grandchildImplId,
          chatId: "chat-1",
          managed: true,
        },
      ),
    },
    sectionVariants: {
      [rootVariantId]: createVariant({
        id: rootVariantId,
        impl: rootImplId,
        nonPresetImpls: [],
      }),
      [childVariantId]: createVariant({
        id: childVariantId,
        impl: childImplId,
        nonPresetImpls: [],
      }),
      [grandchildVariantId]: createVariant({
        id: grandchildVariantId,
        impl: grandchildImplId,
        nonPresetImpls: [],
      }),
    },
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: {
      [rootSectionId]: null,
      [childSectionId]: rootSectionId,
      [grandchildSectionId]: childSectionId,
    },
    shownParamIds: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;
}

describe("section hierarchy helpers", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("walks up to the highest ancestor using the provided parent getter", () => {
    const highestAncestor = getHighestAncestor("grandchild-section", (id) => {
      const parentById: Record<string, string | null> = {
        "grandchild-section": "child-section",
        "child-section": "root-section",
        "root-section": null,
      };
      return parentById[id] ?? null;
    });

    expect(highestAncestor).toBe("root-section");
  });

  it("returns every descendant in breadth-first order", () => {
    const state = buildHierarchyState();

    expect(getSectionDescendants("root-section", state)).toEqual([
      "root-section",
      "child-section",
      "grandchild-section",
    ]);
  });

  it("updates parent children lists through the effective impl mutation helper", () => {
    const state = buildHierarchyState();

    setSectionChildren(state, "root-section", () => ["child-section", "extra"]);

    const rootImpl = getCurrEffectiveSectionImpl(state, "root-section");
    if (rootImpl.type !== "Group") {
      throw new Error("Expected group section impl.");
    }

    expect(rootImpl.children).toEqual(["child-section", "extra"]);
  });

  it("resets sections back to their default variants", () => {
    useProjectState.setState((state) => {
      state.sections = {
        "section-1": {
          variantId: "variant-b",
          defaultVariantId: "variant-a",
        },
      } as typeof state.sections;
    });

    resetSectionsToDefaultVersions(["section-1"]);

    expect(useProjectState.getState().sections["section-1"].variantId).toBe(
      "variant-a",
    );
  });
});
