import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ConfigLanguageEnum,
  createCodeParamCodeObjImpl,
  createDictSectionImpl,
  createProjectConfig,
  createSettingsState,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DictArea } from "./DictArea";

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

describe("DictArea layout", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps DOM params by default and omits them when retained content owns rows", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "impl-1";
    const paramId = "param-1";
    const paramVariantId = "param-variant-1";
    const paramImplId = "param-impl-1";

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

    const dictImpl = createDictSectionImpl({
      id: implId,
      name: "Dict",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
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
    });

    const paramCore: Core = {
      id: paramId,
      name: "param",
      displayName: "",
      variants: [paramVariantId],
      defaultVariant: paramVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const paramVariant: Variant = {
      id: paramVariantId,
      name: "ParamVariant",
      impl: paramImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const paramImpl = createCodeParamCodeObjImpl({
      id: paramImplId,
      name: "Param",
      description: "",
      isPreset: false,
      coreNameEditable: true,
      defaultVal: "",
      value: "",
    });

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
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <DictArea sectionId={sectionId} bgColor="bg-transparent" />,
    );
    const match = markup.match(
      /class=\"([^\"]*section-args-nested[^\"]*overflow-y-scroll[^\"]*)\"/,
    );
    expect(match).not.toBeNull();
    const classes = (match?.[1] ?? "").split(" ");
    expect(classes).toContain("section-args-nested");
    expect(classes).toContain("overflow-y-scroll");
    expect(markup).toContain(`ParamContainer-${sectionId}-${paramId}`);
    expect(markup).toContain("section-row-pin-main");

    const retainedMarkup = renderToStaticMarkup(
      <DictArea
        sectionId={sectionId}
        bgColor="bg-transparent"
        renderParamRows={false}
      />,
    );
    expect(retainedMarkup).toContain("section-row-pin-main");
    expect(retainedMarkup).toContain("overflow-hidden");
    expect(retainedMarkup).not.toContain("overflow-y-scroll");
    expect(retainedMarkup).not.toContain(
      `ParamContainer-${sectionId}-${paramId}`,
    );
  });
});
