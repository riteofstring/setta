import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { useDndState } from "forks/dnd-kit/dndState";
import { BehaviorDropTypeEnum } from "forks/dnd-kit/dropTypes";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createChatSectionImpl,
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createTerminalSectionImpl,
  createUserDefaultChatSectionImpl,
  type BaseSectionImplUnion,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBehaviorDropType, getOverId } from "./useDropType";

type SectionSpec = {
  id: string;
  type: SectionTypeEnum;
  children?: string[];
  variantFrozen?: boolean;
};

function buildListRootImpl(
  id: string,
  children: string[] = [],
): BaseSectionImplUnion {
  return {
    type: SectionTypeEnum.ListRoot,
    id,
    name: `${id}-impl`,
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: { width: 500, height: 300 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    children,
  };
}

function buildGenPythonImpl(
  id: string,
  children: string[] = [],
): BaseSectionImplUnion {
  return {
    type: SectionTypeEnum.GenPythonCode,
    id,
    name: `${id}-impl`,
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 500, height: 300 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    children,
    code: "",
    codeFileBinding: null,
    attachedTerminalSectionId: null,
  };
}

function buildImpl(spec: SectionSpec): BaseSectionImplUnion {
  if (spec.type === SectionTypeEnum.ListRoot) {
    return buildListRootImpl(spec.id, spec.children ?? []);
  }

  if (spec.type === SectionTypeEnum.Code) {
    return createCodeSectionImpl(
      {
        id: spec.id,
        type: SectionTypeEnum.Code,
      },
      {
        id: spec.id,
        type: SectionTypeEnum.Code,
        children: spec.children ?? [],
      },
    );
  }

  if (spec.type === SectionTypeEnum.Terminal) {
    return createTerminalSectionImpl({
      id: spec.id,
      type: SectionTypeEnum.Terminal,
    });
  }

  if (spec.type === SectionTypeEnum.Chat) {
    return createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId: null }),
      {
        id: spec.id,
        type: SectionTypeEnum.Chat,
        managed: true,
        chatId: null,
        engineConfigId: "engine-1",
        thinking: true,
      },
    );
  }

  if (spec.type === SectionTypeEnum.GenPythonCode) {
    return buildGenPythonImpl(spec.id, spec.children ?? []);
  }

  throw new Error(`Unsupported test section type: ${spec.type}`);
}

function seedProjectState({
  sections,
  parentSectionMap,
  globalVariablesId,
}: {
  sections: SectionSpec[];
  parentSectionMap?: Record<string, string | null>;
  globalVariablesId?: string | null;
}) {
  const cores: Record<string, Core> = {};
  const variants: Record<string, Variant> = {};
  const impls: Record<string, BaseSectionImplUnion> = {};
  const sectionVariantMap: Record<string, string> = {};
  const topLevelSections: Record<
    string,
    { x: number; y: number; zIndex: number }
  > = {};

  sections.forEach((section, index) => {
    const variantId = `${section.id}-variant`;
    const implId = `${section.id}-impl`;

    cores[section.id] = createCore({
      id: section.id,
      name: section.id,
      variants: [variantId],
      defaultVariant: variantId,
      sharedModifier: {},
      unsharedKeys: [],
    });
    variants[variantId] = {
      id: variantId,
      name: `${section.id}-variant-name`,
      impl: implId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: section.variantFrozen ?? false,
    };

    const impl = buildImpl({ ...section, id: implId });
    impls[implId] = impl;
    sectionVariantMap[section.id] = variantId;

    if (!parentSectionMap || parentSectionMap[section.id] === null) {
      topLevelSections[section.id] = { x: index * 20, y: 0, zIndex: index + 1 };
    }
  });

  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap,
      topLevelSections,
    }),
    sections: cores,
    sectionVariants: variants,
    sectionImpls: impls,
    parentSectionMap:
      parentSectionMap ??
      Object.fromEntries(sections.map((section) => [section.id, null])),
    singletonSections: {
      GlobalVariables: globalVariablesId ?? null,
    },
  });
}

type CollisionInput = {
  id: string;
  containerId?: string;
  intersectionRatio?: number;
};

function collision({ id, containerId, intersectionRatio = 0 }: CollisionInput) {
  const droppable = containerId
    ? {
        data: {
          current: {
            sortable: {
              containerId,
            },
          },
        },
      }
    : undefined;

  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: intersectionRatio,
    data: {
      droppable,
      intersectionRatio,
    },
  };
}

describe("getBehaviorDropType", () => {
  beforeEach(() => {
    resetProjectStores();
    useDndState.setState({ draggingIds: [] });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("allows terminal drop onto gen python code sections", () => {
    // Validates the code-parent happy path used for embedded terminal attachment.
    seedProjectState({
      sections: [
        { id: "gen", type: SectionTypeEnum.GenPythonCode, children: [] },
        { id: "terminal", type: SectionTypeEnum.Terminal },
      ],
    });

    const behavior = getBehaviorDropType("terminal", "gen");

    expect(behavior).not.toBe(BehaviorDropTypeEnum.INVALID);
    expect(behavior).toBeNull();
  });

  it("rejects drop targets that are neither root nor code", () => {
    // Validates parent-type guard for non-container section kinds.
    seedProjectState({
      sections: [
        { id: "chat-parent", type: SectionTypeEnum.Chat },
        { id: "dragged", type: SectionTypeEnum.Code },
      ],
    });

    expect(getBehaviorDropType("dragged", "chat-parent")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects frozen parent variants", () => {
    // Validates variant freeze guard regardless of section type.
    seedProjectState({
      sections: [
        {
          id: "list-root",
          type: SectionTypeEnum.ListRoot,
          variantFrozen: true,
        },
        { id: "dragged", type: SectionTypeEnum.Code },
      ],
    });

    expect(getBehaviorDropType("dragged", "list-root")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects drops for the global variables singleton section", () => {
    // Validates singleton section drag restriction by section id.
    seedProjectState({
      sections: [
        { id: "list-root", type: SectionTypeEnum.ListRoot },
        { id: "global-like", type: SectionTypeEnum.Code },
      ],
      globalVariablesId: "global-like",
    });

    expect(getBehaviorDropType("global-like", "list-root")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects non-terminal drops into code parents", () => {
    // Validates code-parent type rule requiring terminal children.
    seedProjectState({
      sections: [
        {
          id: "code-parent",
          type: SectionTypeEnum.GenPythonCode,
          children: [],
        },
        { id: "dragged-code", type: SectionTypeEnum.Code },
      ],
    });

    expect(getBehaviorDropType("dragged-code", "code-parent")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects multi-selection drops into code parents", () => {
    // Validates code-parent single-selection requirement for terminal attachment.
    seedProjectState({
      sections: [
        {
          id: "code-parent",
          type: SectionTypeEnum.GenPythonCode,
          children: [],
        },
        { id: "terminal-a", type: SectionTypeEnum.Terminal },
        { id: "terminal-b", type: SectionTypeEnum.Terminal },
      ],
    });
    useDndState.setState({ draggingIds: ["terminal-a", "terminal-b"] });

    expect(getBehaviorDropType("terminal-a", "code-parent")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects terminal drops when code parent already has another child", () => {
    // Validates existing-child guard for code-parent attachment.
    seedProjectState({
      sections: [
        {
          id: "code-parent",
          type: SectionTypeEnum.GenPythonCode,
          children: ["terminal-a"],
        },
        { id: "terminal-a", type: SectionTypeEnum.Terminal },
        { id: "terminal-b", type: SectionTypeEnum.Terminal },
      ],
      parentSectionMap: {
        "code-parent": null,
        "terminal-a": "code-parent",
        "terminal-b": null,
      },
    });

    expect(getBehaviorDropType("terminal-b", "code-parent")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects dropping into descendants of selected sections", () => {
    // Validates cycle-prevention guard when target is under dragged selection.
    seedProjectState({
      sections: [
        { id: "parent", type: SectionTypeEnum.ListRoot, children: ["child"] },
        { id: "child", type: SectionTypeEnum.ListRoot },
      ],
      parentSectionMap: {
        parent: null,
        child: "parent",
      },
    });

    expect(getBehaviorDropType("parent", "child")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });
});

describe("getOverId", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("returns fallback over id when collisions are missing", () => {
    // Validates fallback behavior from raw over target.
    expect(getOverId({ id: "fallback" }, null)).toBe("fallback");
    expect(getOverId(null, null)).toBeNull();
  });

  it("prefers child collision over parent based on dndChildren mapping", () => {
    // Validates live parent/child store integration in over-id resolution.
    updateDndChildren({
      parent: ["child"],
    });

    const overId = getOverId(null, [
      collision({ id: "parent", intersectionRatio: 10 }),
      collision({ id: "child", intersectionRatio: 1 }),
    ]);

    expect(overId).toBe("child");
  });
});
