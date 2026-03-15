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
import {
  ParamGroupContainer,
  getPinnedParamsBgClassName,
} from "./GroupContainer";

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

describe("getPinnedParamsBgClassName", () => {
  it("uses a setta light tint with the dark blue shade", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.Dict);
    expect(result).toBe("bg-setta-100/50 dark:bg-blue-950/30");
  });

  it("uses a solid light tint for global variables and keeps the dark blue shade", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.GlobalVariables);
    expect(result).toBe("bg-setta-50 dark:bg-blue-950/30");
  });

  it("uses the standard light tint for other sections", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.Dict);
    expect(result).toBe("bg-setta-100/50 dark:bg-blue-950/30");
  });

  it("uses a pure white background for callable sections", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.Callable);
    expect(result).toBe("bg-white dark:bg-blue-950/30");
  });
});

describe("ParamGroupContainer layout", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps the unpinned params list scrollable", () => {
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

    const snapshot = useProjectState.getState();
    expect(snapshot.projectConfig.sectionVariantMap[sectionId]).toBe(variantId);

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );
    const match = markup.match(
      /class=\"([^\"]*section-args-nested[^\"]*overflow-y-scroll[^\"]*)\"/,
    );
    expect(match).not.toBeNull();
    const classes = (match?.[1] ?? "").split(" ");
    expect(classes).toContain("section-args-nested");
    expect(classes).toContain("overflow-y-scroll");
    expect(markup).toContain("section-row-pin-main");
    expect(markup).not.toContain("grid-cols-subgrid");
  });

  it("keeps the pinned params shell flat", () => {
    const sectionId = "section-2";
    const variantId = "variant-2";
    const implId = "impl-2";
    const paramId = "param-2";
    const paramVariantId = "param-variant-2";
    const paramImplId = "param-impl-2";

    const projectConfig = createProjectConfig({
      id: "project-2",
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
      hideUnpinnedParams: true,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [paramId],
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
          pinned: {
            requiredParamIdsToPaths: { [paramId]: [paramId] },
            topLevelParamIds: [paramId],
          },
          unpinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        },
      };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );

    // The pinned shell should own its own padding instead of inserting a wrapper-only content div.
    expect(markup).toMatch(
      /<section[^>]*class=\"[^\"]*pb-3 pt-2[^\"]*\"[^>]*data-params-fixed=\"true\"[^>]*><header class=\"flex w-full gap-1 px-2\"/,
    );
    expect(markup).not.toContain(
      'class="flex min-h-0 w-full flex-1 flex-col pb-3 pt-2"',
    );
    expect(markup).not.toContain("grid-cols-subgrid");
  });

  it("keeps the edge strip rows flat", () => {
    const sectionId = "section-3";
    const variantId = "variant-3";
    const implId = "impl-3";
    const paramId = "param-3";
    const paramVariantId = "param-variant-3";
    const paramImplId = "param-impl-3";

    const projectConfig = createProjectConfig({
      id: "project-3",
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
      edgeInputParams: [paramId],
      edgeOutputPorts: [{ id: "out-1", accessor: "result" }],
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
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );

    // The edge strip columns should place rows directly under the label instead of nesting a row-list wrapper div.
    expect(markup).toContain('data-edge-param-side="in"');
    expect(markup).toContain('data-handleid="out-1"');
    expect(markup).not.toContain('class="-ml-2 flex flex-col gap-1 pt-1"');
    expect(markup).not.toContain('class="-mr-2 flex flex-col gap-1 pt-1"');
  });

  it("renders nested param rows as sibling rows", () => {
    const sectionId = "section-4";
    const variantId = "variant-4";
    const implId = "impl-4";
    const parentParamId = "parent-param";
    const childParamId = "child-param";
    const parentVariantId = "parent-variant";
    const childVariantId = "child-variant";
    const parentImplId = "parent-impl";
    const childImplId = "child-impl";

    const projectConfig = createProjectConfig({
      id: "project-4",
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
        [parentParamId]: parentVariantId,
        [childParamId]: childVariantId,
      },
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

    const parentCore: Core = {
      id: parentParamId,
      name: "gamma",
      displayName: "",
      variants: [parentVariantId],
      defaultVariant: parentVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const childCore: Core = {
      id: childParamId,
      name: "delta",
      displayName: "",
      variants: [childVariantId],
      defaultVariant: childVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const parentVariant: Variant = {
      id: parentVariantId,
      name: "ParentVariant",
      impl: parentImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const childVariant: Variant = {
      id: childVariantId,
      name: "ChildVariant",
      impl: childImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const parentImpl = {
      type: CodeObjTypeEnum.NestedParam,
      id: parentImplId,
      name: "gamma",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: "",
      children: [childParamId],
    };

    const childImpl = {
      type: CodeObjTypeEnum.CodeParam,
      id: childImplId,
      name: "delta",
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
        [parentParamId]: parentCore,
        [childParamId]: childCore,
      };
      state.codeObjVariants = {
        [parentVariantId]: parentVariant,
        [childVariantId]: childVariant,
      };
      state.codeObjImpls = {
        [parentImplId]: parentImpl,
        [childImplId]: childImpl,
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
          unpinned: {
            requiredParamIdsToPaths: {
              [parentParamId]: [parentParamId],
              [childParamId]: [parentParamId, childParamId],
            },
            topLevelParamIds: [parentParamId],
          },
        },
      };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );

    expect(markup).not.toContain("section-args-nested section-lg-value");
    expect(markup).toContain(
      `</article><article id=\"ParamContainer-${sectionId}-${childParamId}\"`,
    );
  });

  it("keeps a filtered nested child path and drops unrelated siblings", () => {
    const sectionId = "section-5";
    const variantId = "variant-5";
    const implId = "impl-5";
    const parentParamId = "parent-param";
    const childParamId = "child-param";
    const siblingParamId = "sibling-param";
    const parentVariantId = "parent-variant";
    const childVariantId = "child-variant";
    const siblingVariantId = "sibling-variant";
    const parentImplId = "parent-impl";
    const childImplId = "child-impl";
    const siblingImplId = "sibling-impl";

    const projectConfig = createProjectConfig({
      id: "project-5",
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
        [parentParamId]: parentVariantId,
        [childParamId]: childVariantId,
        [siblingParamId]: siblingVariantId,
      },
      hideUnpinnedParams: false,
      paramFilter: "delta",
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

    const parentCore: Core = {
      id: parentParamId,
      name: "gamma",
      displayName: "",
      variants: [parentVariantId],
      defaultVariant: parentVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const childCore: Core = {
      id: childParamId,
      name: "delta",
      displayName: "",
      variants: [childVariantId],
      defaultVariant: childVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const siblingCore: Core = {
      id: siblingParamId,
      name: "epsilon",
      displayName: "",
      variants: [siblingVariantId],
      defaultVariant: siblingVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };

    const parentVariant: Variant = {
      id: parentVariantId,
      name: "ParentVariant",
      impl: parentImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const childVariant: Variant = {
      id: childVariantId,
      name: "ChildVariant",
      impl: childImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const siblingVariant: Variant = {
      id: siblingVariantId,
      name: "SiblingVariant",
      impl: siblingImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    const parentImpl = {
      type: CodeObjTypeEnum.NestedParam,
      id: parentImplId,
      name: "gamma",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: "",
      children: [childParamId],
    };

    const childImpl = {
      type: CodeObjTypeEnum.CodeParam,
      id: childImplId,
      name: "delta",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    };

    const siblingImpl = {
      type: CodeObjTypeEnum.CodeParam,
      id: siblingImplId,
      name: "epsilon",
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
        [parentParamId]: parentCore,
        [childParamId]: childCore,
        [siblingParamId]: siblingCore,
      };
      state.codeObjVariants = {
        [parentVariantId]: parentVariant,
        [childVariantId]: childVariant,
        [siblingVariantId]: siblingVariant,
      };
      state.codeObjImpls = {
        [parentImplId]: parentImpl,
        [childImplId]: childImpl,
        [siblingImplId]: siblingImpl,
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
          unpinned: {
            requiredParamIdsToPaths: {
              [parentParamId]: [parentParamId],
              [childParamId]: [parentParamId, childParamId],
              [siblingParamId]: [siblingParamId],
            },
            topLevelParamIds: [parentParamId, siblingParamId],
          },
        },
      };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );

    expect(markup).toContain(
      `id="ParamContainer-${sectionId}-${parentParamId}"`,
    );
    expect(markup).toContain(
      `</article><article id=\"ParamContainer-${sectionId}-${childParamId}\"`,
    );
    expect(markup).not.toContain(
      `id="ParamContainer-${sectionId}-${siblingParamId}"`,
    );
  });
});
