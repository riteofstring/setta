import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createSharePolicy,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

import { AppActionContext, AppRuntimeContext } from "./appContext";
import { appRegistry } from "./appRegistry";

describe("AppRenderer policy enforcement", () => {
  let originalInitialState: {
    projectConfig: ReturnType<typeof useProjectState.getState>["projectConfig"];
    sections: ReturnType<typeof useProjectState.getState>["sections"];
    sectionVariants: ReturnType<typeof useProjectState.getState>["sectionVariants"];
    sectionImpls: ReturnType<typeof useProjectState.getState>["sectionImpls"];
    codeObjs: ReturnType<typeof useProjectState.getState>["codeObjs"];
    codeObjVariants: ReturnType<typeof useProjectState.getState>["codeObjVariants"];
    codeObjImpls: ReturnType<typeof useProjectState.getState>["codeObjImpls"];
    parentSectionMap: ReturnType<
      typeof useProjectState.getState
    >["parentSectionMap"];
    previewSectionVariantMap: ReturnType<
      typeof useProjectState.getState
    >["previewSectionVariantMap"];
  };

  beforeEach(() => {
    resetProjectStores();
    const initialState = useProjectState.getInitialState();
    originalInitialState = {
      projectConfig: initialState.projectConfig,
      sections: initialState.sections,
      sectionVariants: initialState.sectionVariants,
      sectionImpls: initialState.sectionImpls,
      codeObjs: initialState.codeObjs,
      codeObjVariants: initialState.codeObjVariants,
      codeObjImpls: initialState.codeObjImpls,
      parentSectionMap: initialState.parentSectionMap,
      previewSectionVariantMap: initialState.previewSectionVariantMap,
    };
  });

  afterEach(() => {
    const initialState = useProjectState.getInitialState();
    Object.assign(initialState, originalInitialState);
    resetProjectStores();
  });

  it("disables param edits and downloads when policy forbids", () => {
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const paramId = "param-1";
    const paramVariantId = "param-variant-1";
    const paramImplId = "param-impl-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    });
    const sectionCore = createCore({
      id: sectionId,
      name: "Section",
      variants: [sectionVariantId],
      defaultVariant: sectionVariantId,
    });
    const sectionVariant = createVariant({
      id: sectionVariantId,
      name: "Section Variant",
      impl: sectionImplId,
      nonPresetImpls: [],
    });
    const sectionImpl = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: sectionImplId,
        codeObjVariantMap: { [paramId]: paramVariantId },
      },
    );
    const paramCore = createCore({
      id: paramId,
      name: "Param",
      displayName: "",
      variants: [paramVariantId],
      defaultVariant: paramVariantId,
    });
    const paramVariant = createVariant({
      id: paramVariantId,
      name: "Param Variant",
      impl: paramImplId,
      nonPresetImpls: [],
    });
    const paramImpl = createCodeParamCodeObjImpl(
      createUserDefaultCodeParamCodeObjImpl(),
      {
        id: paramImplId,
        name: "Param",
        coreNameEditable: true,
      },
    );

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [sectionVariantId]: sectionVariant };
      state.sectionImpls = { [sectionImplId]: sectionImpl };
      state.codeObjs = { [paramId]: paramCore };
      state.codeObjVariants = { [paramVariantId]: paramVariant };
      state.codeObjImpls = { [paramImplId]: paramImpl };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
    });
    const initialState = useProjectState.getInitialState();
    Object.assign(initialState, {
      projectConfig,
      sections: { [sectionId]: sectionCore },
      sectionVariants: { [sectionVariantId]: sectionVariant },
      sectionImpls: { [sectionImplId]: sectionImpl },
      codeObjs: { [paramId]: paramCore },
      codeObjVariants: { [paramVariantId]: paramVariant },
      codeObjImpls: { [paramImplId]: paramImpl },
      parentSectionMap: { [sectionId]: null },
      previewSectionVariantMap: {},
    });
    const snapshot = useProjectState.getState();
    expect(snapshot.projectConfig.sectionVariantMap[sectionId]).toBe(
      sectionVariantId,
    );
    expect(snapshot.sectionVariants[sectionVariantId]).toBeDefined();
    expect(snapshot.sectionImpls[sectionImplId]).toBeDefined();
    expect(isBaseSectionWithParamsImpl(snapshot.sectionImpls[sectionImplId])).toBe(
      true,
    );
    expect(snapshot.sectionImpls[sectionImplId].codeObjVariantMap[paramId]).toBe(
      paramVariantId,
    );
    expect(snapshot.codeObjVariants[paramVariantId]).toBeDefined();
    expect(snapshot.codeObjImpls[paramImplId]).toBeDefined();
    expect(snapshot.codeObjs[paramId]).toBeDefined();

    const runtimeValue = {
      dataBindings: {},
      actions: {
        downloadReport: {
          type: "downloadArtifact",
          artifactId: "artifacts/report.txt",
        },
      },
      policy: createSharePolicy({
        allowParamChanges: false,
        allowFileDownloads: false,
        allowExternalLinks: false,
        allowRun: true,
      }),
      canEditParams: false,
      allowExternalLinks: false,
      allowFileDownloads: false,
    };
    const actionState = {
      canRun: true,
      canReset: true,
      isRunning: false,
      runDisabledReason: null,
    };

    const ParamInput = appRegistry.ParamInput;
    const ActionButton = appRegistry.ActionButton;

    const markup = renderToStaticMarkup(
      <AppRuntimeContext.Provider value={runtimeValue}>
        <AppActionContext.Provider value={actionState}>
          <div>
            <ParamInput
              element={{
                props: {
                  sectionId: "section-1",
                  paramId: "param-1",
                  label: "Param",
                },
              }}
            />
            <ActionButton
              element={{
                props: {
                  action: "downloadReport",
                  label: "Download",
                },
              }}
              onAction={() => {}}
            />
          </div>
        </AppActionContext.Provider>
      </AppRuntimeContext.Provider>,
    );

    expect(markup).toContain("Param edits are disabled by policy.");
    expect(markup).toContain("cursor-not-allowed");
    expect(markup).toContain("File downloads are disabled by policy.");
  });
});
