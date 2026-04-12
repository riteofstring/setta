/* @vitest-environment jsdom */

import {
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  resetSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
import { act } from "react";
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

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const { ParamGroupContainer } = await import("./GroupContainer");

vi.stubGlobal(
  "MutationObserver",
  class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
);

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

function seedParamGroupContainerState() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const pinnedParamId = "param-pinned";
  const pinnedParamVariantId = "param-pinned-variant";
  const pinnedParamImplId = "param-pinned-impl";
  const unpinnedParamId = "param-unpinned";
  const unpinnedParamVariantId = "param-unpinned-variant";
  const unpinnedParamImplId = "param-unpinned-impl";

  const projectConfig = createProjectConfig({
    id: "project-1",
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
      [pinnedParamId]: pinnedParamVariantId,
      [unpinnedParamId]: unpinnedParamVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [pinnedParamId],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [pinnedParamId],
    edgeOutputPorts: [{ accessor: "result", id: "out-1" }],
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };

  const pinnedParamCore: Core = {
    id: pinnedParamId,
    name: "pinned",
    displayName: "",
    variants: [pinnedParamVariantId],
    defaultVariant: pinnedParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const pinnedParamVariant: Variant = {
    id: pinnedParamVariantId,
    name: "PinnedParamVariant",
    impl: pinnedParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const pinnedParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: pinnedParamImplId,
    name: "PinnedParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };

  const unpinnedParamCore: Core = {
    id: unpinnedParamId,
    name: "unpinned",
    displayName: "",
    variants: [unpinnedParamVariantId],
    defaultVariant: unpinnedParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const unpinnedParamVariant: Variant = {
    id: unpinnedParamVariantId,
    name: "UnpinnedParamVariant",
    impl: unpinnedParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const unpinnedParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: unpinnedParamImplId,
    name: "UnpinnedParam",
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
      [pinnedParamId]: pinnedParamCore,
      [unpinnedParamId]: unpinnedParamCore,
    };
    state.codeObjVariants = {
      [pinnedParamVariantId]: pinnedParamVariant,
      [unpinnedParamVariantId]: unpinnedParamVariant,
    };
    state.codeObjImpls = {
      [pinnedParamImplId]: pinnedParamImpl,
      [unpinnedParamImplId]: unpinnedParamImpl,
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: {
          requiredParamIdsToPaths: { [pinnedParamId]: [pinnedParamId] },
          topLevelParamIds: [pinnedParamId],
        },
        unpinned: {
          requiredParamIdsToPaths: { [unpinnedParamId]: [unpinnedParamId] },
          topLevelParamIds: [unpinnedParamId],
        },
      },
    };
  });
  syncStoreInitialState(useProjectState);

  return sectionId;
}

type RenderedParamGroupContainer = {
  host: HTMLDivElement;
  root: Root;
};

async function renderParamGroupContainer(): Promise<RenderedParamGroupContainer> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <ParamGroupContainer
        sectionId={seedParamGroupContainerState()}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );
  });

  return { host, root };
}

describe("ParamGroupContainer instrumentation", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
    resetProjectStores();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("records edges, pinned, and unpinned profiler durations when canary attribution is active", async () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    const { host, root } = await renderParamGroupContainer();

    try {
      const motionAttribution =
        readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
          .motionAttribution;
      expect(
        motionAttribution.presentedSceneSectionParamGroupEdgesStripReactRender
          .count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution.presentedSceneSectionParamGroupPinnedParamsReactRender
          .count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution
          .presentedSceneSectionParamGroupUnpinnedParamsReactRender.count,
      ).toBeGreaterThan(0);
      expect(
        motionAttribution.presentedSceneSectionParamGroupUnpinnedAreaReactRender
          .count,
      ).toBeGreaterThan(0);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
