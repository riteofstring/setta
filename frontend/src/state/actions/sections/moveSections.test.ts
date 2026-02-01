import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { route_move_sections } from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  createCodeSectionImpl,
  createProjectConfig,
  createTerminalSectionImpl,
  type BaseSectionImplUnion,
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

  it("attaches terminals under gen python sections", () => {
    const genSectionId = "gen-section";
    const terminalId = "terminal-section";
    const genVariantId = "gen-variant";
    const terminalVariantId = "terminal-variant";
    const genImplId = "gen-impl";
    const terminalImplId = "terminal-impl";

    const genCore: Core = {
      id: genSectionId,
      name: "Generated Code Section",
      displayName: "",
      variants: [genVariantId],
      defaultVariant: genVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    const terminalCore: Core = {
      id: terminalId,
      name: "Terminal Section",
      displayName: "",
      variants: [terminalVariantId],
      defaultVariant: terminalVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    const genVariant: Variant = {
      id: genVariantId,
      name: "Gen Variant",
      impl: genImplId,
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
    const genImpl: BaseSectionImplUnion = {
      type: SectionTypeEnum.GenPythonCode,
      id: genImplId,
      name: "Generated Code Impl",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      children: [],
      code: "",
      codeFileBinding: null,
      attachedTerminalSectionId: null,
    };

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [genSectionId]: genVariantId,
          [terminalId]: terminalVariantId,
        },
        topLevelSections: {
          [genSectionId]: { x: 10, y: 20, zIndex: 1 },
          [terminalId]: { x: 30, y: 40, zIndex: 2 },
        },
      }),
      sections: {
        [genSectionId]: genCore,
        [terminalId]: terminalCore,
      },
      sectionVariants: {
        [genVariantId]: genVariant,
        [terminalVariantId]: terminalVariant,
      },
      sectionImpls: {
        [genImplId]: genImpl,
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      parentSectionMap: {
        [genSectionId]: null,
        [terminalId]: null,
      },
    });
    useNodeInternals.setState({ x: new Map() });

    moveSectionsWithBackend({
      sectionIds: [terminalId],
      newParentId: genSectionId,
      newIndex: 0,
      positionsById: null,
    });

    const state = useProjectState.getState();
    const genEffective = getCurrEffectiveSectionImpl(state, genSectionId);
    expect(genEffective.attachedTerminalSectionId).toBe(terminalId);
    expect(state.parentSectionMap[terminalId]).toBe(genSectionId);
    expect(state.projectConfig.topLevelSections[terminalId]).toBeUndefined();
  });
});
