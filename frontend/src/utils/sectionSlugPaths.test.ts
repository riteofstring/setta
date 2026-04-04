import {
  createCodeSectionImpl,
  createCore,
  createGroupSectionImpl,
  createProjectConfig,
  createProjectStateSingleConfig,
  createUserDefaultCodeSectionImpl,
  createUserDefaultGroupSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveStandaloneSectionSlug } from "./sectionSlugPaths";

function createSectionState(input: {
  sections: Record<string, { name: string }>;
  parentSectionMap: Record<string, string | null>;
  groupChildrenById?: Record<string, Array<string>>;
  sectionIdsByPathSlug?: Record<string, Array<string>>;
}) {
  const sectionCores: Record<string, ReturnType<typeof createCore>> = {};
  const sectionImpls: Record<
    string,
    | ReturnType<typeof createCodeSectionImpl>
    | ReturnType<typeof createGroupSectionImpl>
  > = {};
  const sectionVariants: Record<string, ReturnType<typeof createVariant>> = {};
  const sectionVariantMap: Record<string, string> = {};

  for (const [sectionId, section] of Object.entries(input.sections)) {
    const variantId = `variant-${sectionId}`;
    const implId = `impl-${sectionId}`;
    sectionCores[sectionId] = createCore({
      id: sectionId,
      name: section.name,
    });
    const groupChildren = input.groupChildrenById?.[sectionId];
    sectionImpls[implId] = groupChildren
      ? createGroupSectionImpl(createUserDefaultGroupSectionImpl(), {
          id: implId,
          children: groupChildren,
        })
      : createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: implId,
        });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [],
    });
    sectionVariantMap[sectionId] = variantId;
  }

  return createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-config-id",
      name: "Test Project",
      sectionVariantMap,
      sectionIdsByPathSlug: input.sectionIdsByPathSlug ?? {},
    }),
    sections: sectionCores,
    sectionImpls,
    sectionVariants,
    parentSectionMap: input.parentSectionMap,
  });
}

describe("sectionSlugPaths", () => {
  it("resolves nested canonical section slugs from the full section path", () => {
    const state = createSectionState({
      sections: {
        parent: { name: "Parent" },
        child: { name: "Blue Star" },
      },
      parentSectionMap: {
        parent: null,
        child: "parent",
      },
      groupChildrenById: {
        parent: ["child"],
      },
      sectionIdsByPathSlug: {
        parent_blue_star: ["child"],
      },
    });

    expect(resolveStandaloneSectionSlug(state, "parent_blue_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Blue Star",
      sectionType: SectionTypeEnum.Code,
    });
  });

  it("fails closed when no section matches the canonical slug", () => {
    const state = createSectionState({
      sections: {
        alpha: { name: "Alpha" },
      },
      parentSectionMap: {
        alpha: null,
      },
    });

    expect(resolveStandaloneSectionSlug(state, "missing_slug")).toEqual({
      kind: "not_found",
      sectionSlug: "missing_slug",
    });
  });

  it("fails closed when multiple sections share the same canonical slug", () => {
    const state = createSectionState({
      sections: {
        first: { name: "Foo Bar" },
        second: { name: "Foo_Bar" },
      },
      parentSectionMap: {
        first: null,
        second: null,
      },
      sectionIdsByPathSlug: {
        foo_bar: ["first", "second"],
      },
    });

    expect(resolveStandaloneSectionSlug(state, "foo_bar")).toEqual({
      kind: "ambiguous",
      sectionSlug: "foo_bar",
      sectionIds: ["first", "second"],
    });
  });

  it("allows chat section slugs now that standalone sections are namespaced", () => {
    const state = createSectionState({
      sections: {
        chatSection: { name: "Chat" },
      },
      parentSectionMap: {
        chatSection: null,
      },
      sectionIdsByPathSlug: {
        chat: ["chatSection"],
      },
    });

    expect(resolveStandaloneSectionSlug(state, "chat")).toEqual({
      kind: "found",
      sectionId: "chatSection",
      sectionName: "Chat",
      sectionType: SectionTypeEnum.Code,
    });
  });

  it("uses backend-owned slug maps instead of recomputing after a local rename", () => {
    const state = createSectionState({
      sections: {
        parent: { name: "Parent" },
        child: { name: "Blue Star" },
      },
      parentSectionMap: {
        parent: null,
        child: "parent",
      },
      groupChildrenById: {
        parent: ["child"],
      },
      sectionIdsByPathSlug: {
        parent_blue_star: ["child"],
      },
    });

    expect(resolveStandaloneSectionSlug(state, "parent_blue_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Blue Star",
      sectionType: SectionTypeEnum.Code,
    });

    state.sections.child.name = "Green Star";

    expect(resolveStandaloneSectionSlug(state, "parent_green_star")).toEqual({
      kind: "not_found",
      sectionSlug: "parent_green_star",
    });
    expect(resolveStandaloneSectionSlug(state, "parent_blue_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Green Star",
      sectionType: SectionTypeEnum.Code,
    });

    state.projectConfig.sectionIdsByPathSlug = {
      parent_green_star: ["child"],
    };

    expect(resolveStandaloneSectionSlug(state, "parent_green_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Green Star",
      sectionType: SectionTypeEnum.Code,
    });
    expect(resolveStandaloneSectionSlug(state, "parent_blue_star")).toEqual({
      kind: "not_found",
      sectionSlug: "parent_blue_star",
    });
  });

  it("uses backend-owned slug maps instead of recomputing after local reparenting", () => {
    const state = createSectionState({
      sections: {
        parentA: { name: "Parent A" },
        parentB: { name: "Parent B" },
        child: { name: "Blue Star" },
      },
      parentSectionMap: {
        parentA: null,
        parentB: null,
        child: "parentA",
      },
      groupChildrenById: {
        parentA: ["child"],
        parentB: [],
      },
      sectionIdsByPathSlug: {
        parent_a_blue_star: ["child"],
      },
    });

    expect(resolveStandaloneSectionSlug(state, "parent_a_blue_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Blue Star",
      sectionType: SectionTypeEnum.Code,
    });

    state.parentSectionMap.child = "parentB";
    state.sectionImpls["impl-parentA"] = createGroupSectionImpl(
      createUserDefaultGroupSectionImpl(),
      {
        id: "impl-parentA",
        children: [],
      },
    );
    state.sectionImpls["impl-parentB"] = createGroupSectionImpl(
      createUserDefaultGroupSectionImpl(),
      {
        id: "impl-parentB",
        children: ["child"],
      },
    );

    expect(resolveStandaloneSectionSlug(state, "parent_a_blue_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Blue Star",
      sectionType: SectionTypeEnum.Code,
    });
    expect(resolveStandaloneSectionSlug(state, "parent_b_blue_star")).toEqual({
      kind: "not_found",
      sectionSlug: "parent_b_blue_star",
    });

    state.projectConfig.sectionIdsByPathSlug = {
      parent_b_blue_star: ["child"],
    };

    expect(resolveStandaloneSectionSlug(state, "parent_a_blue_star")).toEqual({
      kind: "not_found",
      sectionSlug: "parent_a_blue_star",
    });
    expect(resolveStandaloneSectionSlug(state, "parent_b_blue_star")).toEqual({
      kind: "found",
      sectionId: "child",
      sectionName: "Blue Star",
      sectionType: SectionTypeEnum.Code,
    });
  });
});
