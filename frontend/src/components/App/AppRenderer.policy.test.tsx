import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAppConfigs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createSharePolicy,
  createSingletonSections,
  createTextBlockSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
} from "utils/generatedTypes";

import {
  AppActionContext,
  AppConfigScopeContext,
  AppRuntimeContext,
} from "./appContext";
import { appRegistry } from "./appRegistry";

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

describe("AppRenderer policy enforcement", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
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

    useAppConfigs.setState({
      configs: {
        [projectConfig.id]: {
          projectConfig,
          sections: { [sectionId]: sectionCore },
          sectionVariants: { [sectionVariantId]: sectionVariant },
          sectionImpls: { [sectionImplId]: sectionImpl },
          codeObjs: { [paramId]: paramCore },
          codeObjVariants: { [paramVariantId]: paramVariant },
          codeObjImpls: { [paramImplId]: paramImpl },
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: { [sectionId]: null },
          shownParamIds: {},
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
          genCodeBinding: null,
          appSpec: null,
        },
      },
    });
    syncStoreInitialState(useAppConfigs);

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
      defaultConfigId: projectConfig.id,
      theme: null,
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

  it("resolves text output using config scope", () => {
    const sectionId = "section-1";
    const variantAId = "variant-a";
    const variantBId = "variant-b";
    const implAId = "impl-a";
    const implBId = "impl-b";
    const configA = createProjectConfig({
      id: "config-a",
      sectionVariantMap: { [sectionId]: variantAId },
    });
    const configB = createProjectConfig({
      id: "config-b",
      sectionVariantMap: { [sectionId]: variantBId },
    });
    const sectionCore = createCore({
      id: sectionId,
      name: "Output",
      variants: [variantAId, variantBId],
      defaultVariant: variantAId,
    });
    const variantA = createVariant({
      id: variantAId,
      name: "Alpha Variant",
      impl: implAId,
      nonPresetImpls: [],
    });
    const variantB = createVariant({
      id: variantBId,
      name: "Beta Variant",
      impl: implBId,
      nonPresetImpls: [],
    });
    const implA = createTextBlockSectionImpl(
      createUserDefaultTextBlockSectionImpl(),
      { id: implAId, text: "Alpha" },
    );
    const implB = createTextBlockSectionImpl(
      createUserDefaultTextBlockSectionImpl(),
      { id: implBId, text: "Beta" },
    );

    useAppConfigs.setState({
      configs: {
        [configA.id]: {
          projectConfig: configA,
          sections: { [sectionId]: sectionCore },
          sectionVariants: { [variantAId]: variantA, [variantBId]: variantB },
          sectionImpls: { [implAId]: implA, [implBId]: implB },
          codeObjs: {},
          codeObjVariants: {},
          codeObjImpls: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: { [sectionId]: null },
          shownParamIds: {},
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
          genCodeBinding: null,
          appSpec: null,
        },
        [configB.id]: {
          projectConfig: configB,
          sections: { [sectionId]: sectionCore },
          sectionVariants: { [variantAId]: variantA, [variantBId]: variantB },
          sectionImpls: { [implAId]: implA, [implBId]: implB },
          codeObjs: {},
          codeObjVariants: {},
          codeObjImpls: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: { [sectionId]: null },
          shownParamIds: {},
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
          genCodeBinding: null,
          appSpec: null,
        },
      },
    });
    syncStoreInitialState(useAppConfigs);

    const runtimeValue = {
      dataBindings: {},
      actions: {},
      policy: createSharePolicy({ allowRun: true }),
      canEditParams: true,
      allowExternalLinks: true,
      allowFileDownloads: true,
      defaultConfigId: configA.id,
      theme: null,
    };

    const TextOutput = appRegistry.TextOutput;
    const markup = renderToStaticMarkup(
      <AppRuntimeContext.Provider value={runtimeValue}>
        <AppConfigScopeContext.Provider value={{ configId: configB.id }}>
          <TextOutput element={{ props: { sectionId } }} />
        </AppConfigScopeContext.Provider>
      </AppRuntimeContext.Provider>,
    );

    expect(markup).toContain("Beta");
  });
});
