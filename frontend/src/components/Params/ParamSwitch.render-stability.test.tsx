/* @vitest-environment jsdom */

import { act, useState } from "react";
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

const renderCalls = vi.hoisted(() => ({
  paramContainer: vi.fn(),
}));

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

vi.mock("./ParamContainer", () => ({
  ParamContainer: vi.fn((props) => {
    renderCalls.paramContainer(props);
    return <div data-testid={`param-container-${props.paramInfoId}`} />;
  }),
}));

import { ParamSwitch } from "./ParamSwitch";

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

function seedParamSwitchState() {
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
    displayName: "",
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
    coreNameEditable: false,
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

  return { paramId, sectionId };
}

describe("ParamSwitch render stability", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    renderCalls.paramContainer.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("does not rematerialize the row container when only the parent rerenders", async () => {
    const { paramId, sectionId } = seedParamSwitchState();
    const onResizeStart = vi.fn();
    let bumpParentRerender: (() => void) | null = null;

    function ParentRerenderHarness() {
      const [, setParentRenderCount] = useState(0);
      bumpParentRerender = () => {
        setParentRenderCount((count) => count + 1);
      };

      return (
        <ParamSwitch
          sectionId={sectionId}
          paramInfoId={paramId}
          requiredParamIdsToPaths={{ [paramId]: [paramId] }}
          onResizeStart={onResizeStart}
          isTopLevelWithPad={false}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />
      );
    }

    await act(async () => {
      root.render(<ParentRerenderHarness />);
    });

    expect(renderCalls.paramContainer).toHaveBeenCalledTimes(1);

    await act(async () => {
      bumpParentRerender?.();
    });

    expect(renderCalls.paramContainer).toHaveBeenCalledTimes(1);
  });
});
