import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { route_move_sections } from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  createCodeSectionImpl,
  createProjectConfig,
  createTerminalSectionImpl,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moveSectionsWithBackend } from "./moveSections";

vi.mock("utils/generatedEndpoints", () => ({
  route_move_sections: vi.fn(),
}));

const mockedRouteMoveSections = vi.mocked(route_move_sections);

describe("moveSectionsWithBackend", () => {
  const codeSectionId = "code-section";
  const terminalSectionId = "terminal-section";
  const codeVariantId = "code-variant";
  const terminalVariantId = "terminal-variant";
  const codeImplId = "code-impl";
  const terminalImplId = "terminal-impl";

  beforeEach(() => {
    resetProjectStores();
    mockedRouteMoveSections.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("does not move attached terminals as top-level nodes", () => {
    const codeCore: Core = {
      id: codeSectionId,
      name: "Code Section",
      displayName: "",
      variants: [codeVariantId],
      defaultVariant: codeVariantId,
      sharedModifier: {
        attachedTerminalSectionId: terminalSectionId,
        children: [terminalSectionId],
      },
      unsharedKeys: [],
    };
    const terminalCore: Core = {
      id: terminalSectionId,
      name: "Terminal Section",
      displayName: "",
      variants: [terminalVariantId],
      defaultVariant: terminalVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    const codeVariant: Variant = {
      id: codeVariantId,
      name: "Code Variant",
      impl: codeImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };
    const terminalVariant: Variant = {
      id: terminalVariantId,
      name: "Terminal Variant",
      impl: terminalImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [codeSectionId]: codeVariantId,
          [terminalSectionId]: terminalVariantId,
        },
        topLevelSections: {
          [codeSectionId]: { x: 10, y: 20, zIndex: 1 },
        },
      }),
      sections: {
        [codeSectionId]: codeCore,
        [terminalSectionId]: terminalCore,
      },
      sectionVariants: {
        [codeVariantId]: codeVariant,
        [terminalVariantId]: terminalVariant,
      },
      sectionImpls: {
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
          type: SectionTypeEnum.Code,
        }),
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      parentSectionMap: {
        [codeSectionId]: null,
        [terminalSectionId]: codeSectionId,
      },
    });
    useNodeInternals.setState({ x: new Map() });

    moveSectionsWithBackend({
      sectionIds: [codeSectionId],
      newParentId: null,
      newIndex: null,
      positionsById: {
        [codeSectionId]: { x: 60, y: 80 },
      },
    });

    const updated = useProjectState.getState().projectConfig.topLevelSections;
    expect(updated[codeSectionId]).toMatchObject({ x: 60, y: 80 });
    expect(mockedRouteMoveSections).toHaveBeenCalledTimes(1);
    const call = mockedRouteMoveSections.mock.calls[0]?.[0];
    expect(call?.sectionIds).toEqual([codeSectionId]);
    expect(call?.positionsById?.[terminalSectionId]).toBeUndefined();
  });
});
