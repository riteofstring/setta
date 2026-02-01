import {
  getCurrEffectiveSectionImpl,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_move_sections,
  route_set_code_section_attached_terminal,
} from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  createChatSectionImpl,
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createTerminalSectionImpl,
  createUserDefaultChatSectionImpl,
  createVariant,
  type BaseSectionImplUnion,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moveSectionsWithBackend } from "./moveSections";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_move_sections: vi.fn(),
    route_set_code_section_attached_terminal: vi.fn(),
  };
});

const mockedRouteMoveSections = vi.mocked(route_move_sections);
const mockedRouteSetAttachedTerminal = vi.mocked(
  route_set_code_section_attached_terminal,
);

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

function seedProjectState() {
  const sectionCore = createCore({
    id: sectionId,
    name: "Chat",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Chat Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: null }),
    {
      id: implId,
      chatId: null,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  );
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.parentSectionMap = { [sectionId]: null };
    state.projectConfig.topLevelSections = {
      [sectionId]: { x: 0, y: 0, zIndex: 1, w: null, h: null },
    };
    state.previewSectionVariantMap = {};
  });
  useNodeInternals.setState({
    x: new Map([
      [
        sectionId,
        {
          id: sectionId,
          position: { x: 0, y: 0 },
          width: null,
          height: null,
          zIndex: 1,
          tempZIndex: 1,
        },
      ],
    ]),
  });
}

describe("move section optimistic updates", () => {
  beforeEach(() => {
    resetProjectStores();
    (
      globalThis as {
        requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      }
    ).requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };
    (
      globalThis as { cancelAnimationFrame?: (id: number) => void }
    ).cancelAnimationFrame = () => {};
    seedProjectState();
    mockedRouteMoveSections.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("reapplies pending moves using a stable position snapshot", () => {
    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    const positionsById = { [sectionId]: { x: 100, y: 200 } };

    moveSectionsWithBackend({
      sectionIds: [sectionId],
      newParentId: null,
      newIndex: null,
      positionsById,
    });

    positionsById[sectionId].x = 999;
    positionsById[sectionId].y = 999;

    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });

    const position =
      useProjectState.getState().projectConfig.topLevelSections[sectionId];
    expect(position.x).toBe(100);
    expect(position.y).toBe(200);
  });
});

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
    mockedRouteSetAttachedTerminal.mockResolvedValue({
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
    expect(mockedRouteSetAttachedTerminal).not.toHaveBeenCalled();
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
    expect(mockedRouteMoveSections).not.toHaveBeenCalled();
    expect(mockedRouteSetAttachedTerminal).toHaveBeenCalledTimes(1);
    const call = mockedRouteSetAttachedTerminal.mock.calls[0]?.[0];
    expect(call?.sectionId).toBe(genSectionId);
    expect(call?.terminalSectionId).toBe(terminalId);
  });
});
