/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialReactFlowState from "forks/xyflow/core/store/initialState";
import {
  Profiler,
  act,
  createElement,
  type ProfilerOnRenderCallback,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  createSettingsState,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  resetSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "../Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";

vi.mock("forks/dnd-kit/adapter", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

import {
  ParamSwitch,
  TempParamPlaceholderRow,
  TempParamPlaceholderShell,
} from "./ParamSwitch";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function seedParamSwitchState({
  isKwarg = false,
}: {
  isKwarg?: boolean;
} = {}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

  const projectConfig = createProjectConfig({
    id: "project-1",
    showParamDisplayNames: false,
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  const sectionCore: Core = {
    id: sectionId,
    name: "Dict",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const dictImpl = {
    type: SectionTypeEnum.Dict,
    id: implId,
    name: "Dict",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 240, height: 160 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    codeObjVariantMap: { [paramId]: paramVariantId },
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [],
    edgeOutputPorts: [],
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };

  const paramCore: Core = {
    id: paramId,
    name: "alpha_param",
    displayName: "Alpha Param",
    variants: [paramVariantId],
    defaultVariant: paramVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const paramVariant: Variant = {
    id: paramVariantId,
    name: "ParamVariantOne",
    impl: paramImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const paramImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: paramImplId,
    name: "AlphaParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: isKwarg,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = { [paramId]: paramCore };
    state.codeObjVariants = { [paramVariantId]: paramVariant };
    state.codeObjImpls = { [paramImplId]: paramImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        unpinned: {
          requiredParamIdsToPaths: { [paramId]: [paramId] },
          topLevelParamIds: [paramId],
        },
      },
    };
    state.requiredDecodedImages = [];
  });
  syncStoreInitialState(useProjectState);

  return { implId, paramId, paramImplId, sectionId };
}

describe("TempParamPlaceholderRow", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    useReactFlow.setState({
      ...initialReactFlowState,
      transform: [0, 0, 1],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
    useReactFlow.setState({ ...initialReactFlowState });
  });

  it("keeps the placeholder shell out of React Flow zoom commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="temp-param-placeholder-shell" onRender={onRender}>
          <TempParamPlaceholderShell
            dndAttributes={{ "data-testid": "temp-param-shell" }}
            dndListeners={{}}
            dndRef={vi.fn()}
            rowStyle={{ width: 120, height: 48 }}
          />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2] });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
  });

  it("updates only the placeholder dimensions when React Flow zoom changes", async () => {
    await act(async () => {
      root.render(
        createElement(TempParamPlaceholderRow, {
          dndAttributes: { "data-testid": "temp-param-row" },
          dndListeners: {},
          dndRef: vi.fn(),
          rowStyle: {
            transform: "translate3d(0px, 0px, 0px)",
            transition: "transform 120ms ease",
          },
          placeholderHeight: 96,
          placeholderWidth: 240,
        }),
      );
    });

    const row = host.querySelector<HTMLElement>(
      '[data-testid="temp-param-row"]',
    );
    expect(row?.style.width).toBe("240px");
    expect(row?.style.height).toBe("96px");

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2] });
    });

    expect(row?.style.width).toBe("120px");
    expect(row?.style.height).toBe("48px");
    expect(row?.style.transform).toBe("translate3d(0px, 0px, 0px)");
  });

  it("stays out of unrelated section and code-object commits when row inputs are unchanged", async () => {
    const { implId, paramId, paramImplId, sectionId } = seedParamSwitchState();
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="param-switch-profiler" onRender={onRender}>
          <ParamSwitch
            sectionId={sectionId}
            paramInfoId={paramId}
            requiredParamIdsToPaths={{ [paramId]: [paramId] }}
            onResizeStart={vi.fn()}
            isTopLevelWithPad={false}
            listKey="unpinned"
            hasSectionStyleTheme={false}
          />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useProjectState.setState((state) => {
        state.sectionImpls[implId].positionAndSizeLocked = true;
        state.codeObjImpls[paramImplId].isPreset = true;
      });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
  });

  it("rerenders when the param selection state changes", async () => {
    const { implId, paramId, sectionId } = seedParamSwitchState();
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="param-switch-profiler" onRender={onRender}>
          <ParamSwitch
            sectionId={sectionId}
            paramInfoId={paramId}
            requiredParamIdsToPaths={{ [paramId]: [paramId] }}
            onResizeStart={vi.fn()}
            isTopLevelWithPad={false}
            listKey="unpinned"
            hasSectionStyleTheme={false}
          />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useProjectState.setState((state) => {
        state.sectionImpls[implId].selectedParams = [paramId];
      });
    });

    expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
    expect(
      host.querySelector<HTMLElement>(`#ParamContainer-${sectionId}-${paramId}`)
        ?.className,
    ).toContain("!bg-blue-700");
  });

  it("records text-label and input profiler durations when attribution is active", async () => {
    const { paramId, sectionId } = seedParamSwitchState();

    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    await act(async () => {
      root.render(
        <ParamSwitch
          sectionId={sectionId}
          paramInfoId={paramId}
          requiredParamIdsToPaths={{ [paramId]: [paramId] }}
          onResizeStart={vi.fn()}
          isTopLevelWithPad={false}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />,
      );
    });

    const motionAttribution =
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution;
    expect(
      motionAttribution.presentedSceneSectionParamTextLabelReactRender.count,
    ).toBeGreaterThan(0);
    expect(
      motionAttribution.presentedSceneSectionParamInputReactRender.count,
    ).toBeGreaterThan(0);
  });

  it("records kwarg name-input profiler durations when attribution is active", async () => {
    const { paramId, sectionId } = seedParamSwitchState({ isKwarg: true });

    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    await act(async () => {
      root.render(
        <ParamSwitch
          sectionId={sectionId}
          paramInfoId={paramId}
          requiredParamIdsToPaths={{ [paramId]: [paramId] }}
          onResizeStart={vi.fn()}
          isTopLevelWithPad={false}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />,
      );
    });

    expect(
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.presentedSceneSectionParamNameInputReactRender.count,
    ).toBeGreaterThan(0);
  });
});
