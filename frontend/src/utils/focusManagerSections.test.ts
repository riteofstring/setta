// @vitest-environment jsdom

import { useProjectState, type ZustandProjectState } from "state/definitions";
import { useSectionRefs } from "state/stores/layoutInteractionStores";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createGroupSectionImpl,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSingletonSections,
  createUserDefaultCodeSectionImpl,
  createUserDefaultGroupSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const movePaneToIncludeElementMock = vi.hoisted(() => vi.fn());
const applyActiveSectionChangeMock = vi.hoisted(() => vi.fn());

vi.mock("forks/xyflow/core/utils/graph", () => ({
  movePaneToIncludeElement: movePaneToIncludeElementMock,
}));

vi.mock("state/actions/activeSectionController", () => ({
  applyActiveSectionChange: applyActiveSectionChangeMock,
}));

import {
  focusAdjacentTopLevelSection,
  focusOnSection,
} from "./focusManagerSections";

type SectionSpec = {
  sectionId: string;
  type: SectionTypeEnum.Group | SectionTypeEnum.Code;
  parentId?: string | null;
  children?: Array<string>;
  topLevelLayout?: {
    x: number;
    y: number;
    zIndex: number;
    w: number | null;
    h: number | null;
  };
};

function markVisible(element: HTMLElement) {
  Object.defineProperty(element, "offsetParent", {
    configurable: true,
    get: () => document.body,
  });
}

function configureProjectState(sectionSpecs: Array<SectionSpec>) {
  const sections: ZustandProjectState["sections"] = {};
  const sectionImpls: ZustandProjectState["sectionImpls"] = {};
  const sectionVariants: ZustandProjectState["sectionVariants"] = {};
  const sectionVariantMap: Record<string, string> = {};
  const parentSectionMap: Record<string, string | null> = {};
  const topLevelSections: Record<string, SectionSpec["topLevelLayout"]> = {};

  for (const spec of sectionSpecs) {
    const variantId = `variant-${spec.sectionId}`;
    const implId = `impl-${spec.sectionId}`;
    sections[spec.sectionId] = createCore({
      id: spec.sectionId,
      name: spec.sectionId,
      variants: [variantId],
      defaultVariant: variantId,
    });
    sectionImpls[implId] =
      spec.type === SectionTypeEnum.Group
        ? createGroupSectionImpl(createUserDefaultGroupSectionImpl(), {
            id: implId,
            children: spec.children ?? [],
          })
        : createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
            id: implId,
          });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: variantId,
      nonPresetImpls: [implId],
    });
    sectionVariantMap[spec.sectionId] = variantId;
    parentSectionMap[spec.sectionId] = spec.parentId ?? null;
    if (spec.topLevelLayout) {
      topLevelSections[spec.sectionId] = spec.topLevelLayout;
    }
  }

  useProjectState.setState(
    createProjectStateSingleConfig({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap,
        topLevelSections,
      }),
      sections,
      sectionImpls,
      sectionVariants,
      parentSectionMap,
      singletonSections: createSingletonSections(),
    }) as ZustandProjectState,
  );
}

describe("focusManagerSections", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("focuses the section container for group sections", () => {
    configureProjectState([
      {
        sectionId: "group-a",
        type: SectionTypeEnum.Group,
        topLevelLayout: {
          x: 0,
          y: 0,
          zIndex: 0,
          w: null,
          h: null,
        },
      },
    ]);

    const groupRoot = document.createElement("div");
    groupRoot.tabIndex = 0;
    markVisible(groupRoot);
    document.body.append(groupRoot);

    useSectionRefs.setState((state) => {
      state.withNested["group-a"] = groupRoot;
      state.selfOnly["group-a"] = groupRoot;
    });

    focusOnSection(null, "group-a");

    expect(document.activeElement).toBe(groupRoot);
    expect(movePaneToIncludeElementMock).toHaveBeenCalledWith(groupRoot);
  });

  it("moves canvas focus to the next top-level section and updates active selection", () => {
    configureProjectState([
      {
        sectionId: "section-a",
        type: SectionTypeEnum.Code,
        topLevelLayout: {
          x: 0,
          y: 0,
          zIndex: 0,
          w: null,
          h: null,
        },
      },
      {
        sectionId: "section-b",
        type: SectionTypeEnum.Code,
        topLevelLayout: {
          x: 200,
          y: 0,
          zIndex: 0,
          w: null,
          h: null,
        },
      },
    ]);

    const canvasRoot = document.createElement("div");
    canvasRoot.setAttribute("data-tab-scope", "canvas");
    document.body.append(canvasRoot);

    const sectionA = document.createElement("div");
    sectionA.className = "react-flow__node";
    sectionA.setAttribute("data-id", "section-a");
    sectionA.tabIndex = 0;
    markVisible(sectionA);
    const sectionASelf = document.createElement("div");
    markVisible(sectionASelf);
    const sectionAButton = document.createElement("button");
    sectionAButton.textContent = "Section A";
    markVisible(sectionAButton);
    sectionASelf.append(sectionAButton);
    sectionA.append(sectionASelf);

    const sectionB = document.createElement("div");
    sectionB.className = "react-flow__node";
    sectionB.setAttribute("data-id", "section-b");
    sectionB.tabIndex = 0;
    markVisible(sectionB);
    const sectionBSelf = document.createElement("div");
    markVisible(sectionBSelf);
    const sectionBButton = document.createElement("button");
    sectionBButton.textContent = "Section B";
    markVisible(sectionBButton);
    sectionBSelf.append(sectionBButton);
    sectionB.append(sectionBSelf);

    canvasRoot.append(sectionA, sectionB);

    useSectionRefs.setState((state) => {
      state.withNested["section-a"] = sectionA;
      state.selfOnly["section-a"] = sectionASelf;
      state.withNested["section-b"] = sectionB;
      state.selfOnly["section-b"] = sectionBSelf;
    });

    sectionAButton.focus();

    expect(
      focusAdjacentTopLevelSection({
        direction: 1,
      }),
    ).toBe(true);
    expect(applyActiveSectionChangeMock).toHaveBeenCalledWith({
      interaction: "go-to",
      sectionId: "section-b",
    });
    expect(document.activeElement).toBe(sectionBButton);
    expect(movePaneToIncludeElementMock).toHaveBeenLastCalledWith(
      sectionBButton,
    );
  });
});
