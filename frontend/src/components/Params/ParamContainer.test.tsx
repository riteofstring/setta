import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
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
  getParamContainerTooltipContent,
  ParamContainer,
} from "./ParamContainer";

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

describe("ParamContainer", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps the row container as a single article boundary", () => {
    const sectionId = "section-1";
    const variantId = "variant-1";
    const implId = "impl-1";
    const paramId = "parent-param";
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
      name: "gamma",
      displayName: "",
      variants: [paramVariantId],
      defaultVariant: paramVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const paramVariant: Variant = {
      id: paramVariantId,
      name: "ParentVariant",
      impl: paramImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const paramImpl = {
      type: CodeObjTypeEnum.NestedParam,
      id: paramImplId,
      name: "gamma",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: "",
      children: ["child-param"],
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
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <ParamContainer
        sectionId={sectionId}
        paramInfoId={paramId}
        labelShapeKey="nameInputParent"
        onResizeStart={vi.fn()}
        isNestedParam={true}
        hasSectionStyleTheme={false}
        maybeErrorMessage=""
      >
        <span>gamma</span>
      </ParamContainer>,
    );

    const articleCount = markup.match(/<article/g)?.length ?? 0;
    expect(articleCount).toBe(1);
    expect(markup).toContain(`id="ParamContainer-${sectionId}-${paramId}"`);
    expect(markup).toContain('data-param-row="true"');
    expect(markup).not.toContain("section-args-nested section-lg-value");
  });

  it("builds tooltip content lazily from project state", () => {
    const sectionId = "section-2";
    const variantId = "variant-2";
    const implId = "impl-2";
    const paramId = "leaf-param";
    const paramVariantId = "param-variant-2";
    const paramImplId = "param-impl-2";

    const projectConfig = createProjectConfig({
      id: "project-2",
      showParamDisplayNames: true,
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
      name: "gamma",
      displayName: "Gamma Display",
      variants: [paramVariantId],
      defaultVariant: paramVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const paramVariant: Variant = {
      id: paramVariantId,
      name: "LeafVariant",
      impl: paramImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const paramImpl = {
      type: CodeObjTypeEnum.CodeParam,
      id: paramImplId,
      name: "gamma",
      description: "Gamma description",
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
    });
    syncStoreInitialState(useProjectState);

    const tooltipPages = getParamContainerTooltipContent({
      state: useProjectState.getState(),
      sectionId,
      paramInfoId: paramId,
      errorMessage: "Bad gamma",
    });

    expect(tooltipPages).toHaveLength(2);
    expect(tooltipPages[0]?.content).toBe("Bad gamma");
    expect(tooltipPages[1]?.title).toBe("Gamma Display");
    expect(tooltipPages[1]?.content).toBe("Gamma description");
  });
});
