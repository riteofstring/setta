import { usePendingOperations, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createGroupSectionImpl,
  createProjectConfig,
  createSectionSize,
  createUserDefaultChatSectionImpl,
  createUserDefaultGroupSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrEffectiveSectionImpl } from "../sectionEffectiveImplSelectors";

const routeSetSectionSizesMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_set_section_sizes: (...args: unknown[]) =>
    routeSetSectionSizesMock(...args),
}));

import {
  persistSectionSizeUpdate,
  sendSectionSizes,
} from "./sectionSizePersistence";

function flushOptimisticMutation(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function seedSectionTree() {
  const rootSectionId = "root-section";
  const childASectionId = "child-a-section";
  const childBSectionId = "child-b-section";
  const rootVariantId = "root-variant";
  const childAVariantId = "child-a-variant";
  const childBVariantId = "child-b-variant";
  const rootImplId = "root-impl";
  const childAImplId = "child-a-impl";
  const childBImplId = "child-b-impl";

  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [rootSectionId]: rootVariantId,
        [childASectionId]: childAVariantId,
        [childBSectionId]: childBVariantId,
      },
    }),
    sections: {
      [rootSectionId]: createCore({
        id: rootSectionId,
        variants: [rootVariantId],
        defaultVariant: rootVariantId,
      }),
      [childASectionId]: createCore({
        id: childASectionId,
        variants: [childAVariantId],
        defaultVariant: childAVariantId,
      }),
      [childBSectionId]: createCore({
        id: childBSectionId,
        variants: [childBVariantId],
        defaultVariant: childBVariantId,
      }),
    },
    sectionImpls: {
      [rootImplId]: createGroupSectionImpl(
        createUserDefaultGroupSectionImpl(),
        {
          id: rootImplId,
          children: [childASectionId, childBSectionId],
          isHorizontalOrientation: false,
          size: createSectionSize({ width: 240, height: 180 }),
        },
      ),
      [childAImplId]: {
        ...createChatSectionImpl(createUserDefaultChatSectionImpl(), {
          id: childAImplId,
          size: createSectionSize({ width: 240, height: 180 }),
        }),
        parentId: rootSectionId,
      },
      [childBImplId]: {
        ...createChatSectionImpl(createUserDefaultChatSectionImpl(), {
          id: childBImplId,
          size: createSectionSize({ width: 200, height: 160 }),
        }),
        parentId: rootSectionId,
      },
    },
    sectionVariants: {
      [rootVariantId]: createVariant({
        id: rootVariantId,
        impl: rootImplId,
        nonPresetImpls: [],
      }),
      [childAVariantId]: createVariant({
        id: childAVariantId,
        impl: childAImplId,
        nonPresetImpls: [],
      }),
      [childBVariantId]: createVariant({
        id: childBVariantId,
        impl: childBImplId,
        nonPresetImpls: [],
      }),
    },
  });

  return {
    rootSectionId,
    childASectionId,
    childBSectionId,
  };
}

describe("sectionSizePersistence", () => {
  beforeEach(() => {
    resetProjectStores();
    usePendingOperations.setState({ pending: [] });
    routeSetSectionSizesMock.mockReset();
  });

  it("persists the changed section size for the current project", async () => {
    const { childASectionId } = seedSectionTree();
    routeSetSectionSizesMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    persistSectionSizeUpdate(childASectionId, { width: 320 });
    await flushOptimisticMutation();

    expect(routeSetSectionSizesMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionSizes: {
        [childASectionId]: expect.objectContaining({
          width: 320,
          height: 180,
        }),
      },
      frontendOpId: expect.any(String),
    });
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), childASectionId)
        .size.width,
    ).toBe(320);
  });

  it("rolls back section sizes when the backend rejects the update", async () => {
    seedSectionTree();
    routeSetSectionSizesMock.mockResolvedValue({
      data: { detail: "Forbidden" },
      status: 403,
      hasResponse: true,
    });

    persistSectionSizeUpdate("child-a-section", { width: 320, height: 240 });
    await flushOptimisticMutation();

    expect(
      useProjectState.getState().sectionImpls["child-a-impl"]?.size,
    ).toEqual(
      expect.objectContaining({
        width: 240,
        height: 180,
      }),
    );
    expect(usePendingOperations.getState().pending).toEqual([]);
  });

  it("sends explicit section sizes without an optimistic wrapper", async () => {
    seedSectionTree();
    routeSetSectionSizesMock.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });

    await sendSectionSizes({
      sectionSizes: {
        "child-a-section": createSectionSize({ width: 260, height: 200 }),
      },
    });

    expect(routeSetSectionSizesMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionSizes: {
        "child-a-section": expect.objectContaining({
          width: 260,
          height: 200,
        }),
      },
      frontendOpId: undefined,
    });
  });
});
