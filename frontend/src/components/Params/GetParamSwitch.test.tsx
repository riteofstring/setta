/* @vitest-environment jsdom */

import { Profiler, act, type ProfilerOnRenderCallback } from "react";
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
import { GetParamSwitch } from "./GetParamSwitch";

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

function seedGetParamSwitchState({
  paramFilter,
  showParamDisplayNames = false,
}: {
  paramFilter: string;
  showParamDisplayNames?: boolean;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const firstParamId = "param-1";
  const secondParamId = "param-2";
  const firstParamVariantId = "param-variant-1";
  const secondParamVariantId = "param-variant-2";
  const firstParamImplId = "param-impl-1";
  const secondParamImplId = "param-impl-2";

  const projectConfig = createProjectConfig({
    id: "project-1",
    showParamDisplayNames,
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
    codeObjVariantMap: {
      [firstParamId]: firstParamVariantId,
      [secondParamId]: secondParamVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter,
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

  const firstParamCore: Core = {
    id: firstParamId,
    name: "alpha_param",
    displayName: "Alpha Param",
    variants: [firstParamVariantId],
    defaultVariant: firstParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const secondParamCore: Core = {
    id: secondParamId,
    name: "beta_param",
    displayName: "Beta Param",
    variants: [secondParamVariantId],
    defaultVariant: secondParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const firstParamVariant: Variant = {
    id: firstParamVariantId,
    name: "ParamVariantOne",
    impl: firstParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const secondParamVariant: Variant = {
    id: secondParamVariantId,
    name: "ParamVariantTwo",
    impl: secondParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const firstParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: firstParamImplId,
    name: "AlphaParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };
  const secondParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: secondParamImplId,
    name: "BetaParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = {
      [firstParamId]: firstParamCore,
      [secondParamId]: secondParamCore,
    };
    state.codeObjVariants = {
      [firstParamVariantId]: firstParamVariant,
      [secondParamVariantId]: secondParamVariant,
    };
    state.codeObjImpls = {
      [firstParamImplId]: firstParamImpl,
      [secondParamImplId]: secondParamImpl,
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        unpinned: {
          requiredParamIdsToPaths: {
            [firstParamId]: [firstParamId],
            [secondParamId]: [secondParamId],
          },
          topLevelParamIds: [firstParamId, secondParamId],
        },
      },
    };
    state.requiredDecodedImages = [];
  });
  syncStoreInitialState(useProjectState);

  return {
    sectionId,
    paramIds: [firstParamId, secondParamId],
    requiredParamIdsToPaths: {
      [firstParamId]: [firstParamId],
      [secondParamId]: [secondParamId],
    },
  };
}

describe("GetParamSwitch", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
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
  });

  it("keeps the unfiltered row list out of unrelated project-state updates", async () => {
    const { sectionId, paramIds, requiredParamIdsToPaths } =
      seedGetParamSwitchState({ paramFilter: "" });
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="get-param-switch" onRender={onRender}>
          <GetParamSwitch
            sectionId={sectionId}
            paramIds={paramIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={vi.fn()}
            isTopLevel={true}
            listKey="unpinned"
            hasSectionStyleTheme={false}
          />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useProjectState.setState((state) => {
        state.requiredDecodedImages = ["image-1"];
      });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
  });

  it("still filters rows by param display name when a filter is active", async () => {
    const { sectionId, paramIds, requiredParamIdsToPaths } =
      seedGetParamSwitchState({
        paramFilter: "beta",
        showParamDisplayNames: true,
      });

    await act(async () => {
      root.render(
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={vi.fn()}
          isTopLevel={true}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />,
      );
    });

    expect(
      host.querySelector(`#ParamContainer-${sectionId}-param-1`),
    ).toBeNull();
    expect(
      host.querySelector(`#ParamContainer-${sectionId}-param-2`),
    ).not.toBeNull();
  });
});
