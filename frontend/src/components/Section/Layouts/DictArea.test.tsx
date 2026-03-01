import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
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

  it("keeps params in the pinned row area", () => {
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

    const paramImpl = {
      type: CodeObjTypeEnum.CodeParam,
      id: paramImplId,
      name: "Param",
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
    expect(markup).toContain("section-row-pin-main");
    expect(markup).not.toContain('aria-label="Remove arg"><i');
    expect(markup).not.toContain('aria-label="Add arg"><i');
    expect(markup).not.toContain('aria-label="Pin selected args"><i');
    expect(markup).not.toContain('aria-label="Convert to edge connectors"><i');
    expect(markup).not.toContain('aria-label="Delete selected args"><i');
  });
});
