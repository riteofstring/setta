import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  SectionTypeEnum,
  createProjectConfig,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ParamGroupContainer } from "./GroupContainer";

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

describe("ParamGroupContainer layout", () => {
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";
  const callableId = "callable-1";
  const callableVariantId = "callable-variant-1";
  const callableImplId = "callable-impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

  const sectionCore: Core = {
    id: sectionId,
    name: "CallableSection",
    displayName: "",
    variants: [sectionVariantId],
    defaultVariant: sectionVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const sectionVariant: Variant = {
    id: sectionVariantId,
    name: "Default",
    impl: sectionImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const callableCore: Core = {
    id: callableId,
    name: "TestCallable",
    displayName: "",
    variants: [callableVariantId],
    defaultVariant: callableVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const callableVariant: Variant = {
    id: callableVariantId,
    name: "CallableVariant",
    impl: callableImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
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

  beforeEach(() => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    resetProjectStores();
    useShareSession.setState({ isShareMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [sectionVariantId]: sectionVariant };
      state.sectionImpls = {
        [sectionImplId]: {
          type: SectionTypeEnum.Callable,
          id: sectionImplId,
          name: "Callable",
          isFrozen: false,
          isInOtherProjectConfigs: false,
          size: { width: 500, height: 300 },
          aspectRatio: false,
          aspectRatioExtraHeight: 0,
          aspectRatioExtraWidth: 0,
          isMinimized: false,
          positionAndSizeLocked: false,
          isPreset: false,
          codeObjVariantMap: {
            [callableId]: callableVariantId,
            [paramId]: paramVariantId,
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
          callable: callableId,
          hideParams: false,
        },
      };
      state.codeObjs = {
        [callableId]: callableCore,
        [paramId]: paramCore,
      };
      state.codeObjVariants = {
        [callableVariantId]: callableVariant,
        [paramVariantId]: paramVariant,
      };
      state.codeObjImpls = {
        [callableImplId]: {
          type: CodeObjTypeEnum.CodeCallable,
          id: callableImplId,
          name: "CallableImpl",
          description: "",
          isPreset: false,
          children: [paramId],
        },
        [paramImplId]: {
          type: CodeObjTypeEnum.CodeParam,
          id: paramImplId,
          name: "ParamImpl",
          description: "",
          isPreset: false,
          coreNameType: "TEXT",
          coreNameEditable: false,
          passingStyle: "DEFAULT",
          defaultVal: "",
          value: "",
        },
      };
      state.shownParamIds = {
        [sectionVariantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
          unpinned: {
            requiredParamIdsToPaths: { [paramId]: [paramId] },
            topLevelParamIds: [paramId],
          },
        },
      };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("anchors the params container to the pin row in the grid layout", () => {
    const markup = renderToStaticMarkup(
      <ParamGroupContainer sectionId={sectionId} />,
    );
    const match = markup.match(/<div class=\"([^\"]+)\"/);
    expect(match).not.toBeNull();
    const classes = match?.[1]?.split(" ") ?? [];
    expect(classes).toContain("section-row-pin-main");
    expect(markup).toContain(`ParamContainer-${sectionId}-${paramId}`);
  });
});
