import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAppConfigs } from "state/stores/appStores";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createSharePolicy,
  createSingletonSections,
  createTextBlockSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
} from "utils/generatedTypes";

import { AppConfigScopeContext, AppRuntimeContext } from "./appContext";
import {
  ImageOutputBlock,
  TextOutputBlock,
  resolveTextOutputData,
} from "./appRegistryOutputBlocks";

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

function createRuntimeValue(defaultConfigId: string | null) {
  return {
    dataBindings: {},
    actions: {},
    policy: createSharePolicy({ allowRun: true }),
    canEditParams: true,
    allowExternalLinks: true,
    allowFileDownloads: true,
    defaultConfigId,
    theme: null,
  };
}

describe("appRegistryOutputBlocks", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("resolves text output using config scope for the extracted output owner", () => {
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
        },
      },
    });
    syncStoreInitialState(useAppConfigs);

    const markup = renderToStaticMarkup(
      <AppRuntimeContext.Provider value={createRuntimeValue(configA.id)}>
        <AppConfigScopeContext.Provider value={{ configId: configB.id }}>
          <TextOutputBlock element={{ props: { sectionId } }} />
        </AppConfigScopeContext.Provider>
      </AppRuntimeContext.Provider>,
    );

    expect(markup).toContain("Beta");
  });

  it("keeps text output modifier precedence inside the extracted output owner", () => {
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    });
    const sectionCore = createCore({
      id: sectionId,
      name: "Output",
      variants: [sectionVariantId],
      defaultVariant: sectionVariantId,
      sharedModifier: {
        text: "From core modifier",
      },
    });
    const sectionVariant = createVariant({
      id: sectionVariantId,
      name: "Variant",
      impl: sectionImplId,
      nonPresetImpls: [],
    });
    const sectionImpl = createTextBlockSectionImpl(
      createUserDefaultTextBlockSectionImpl(),
      { id: sectionImplId, text: "From impl" },
    );

    const configState = {
      projectConfig,
      sections: { [sectionId]: sectionCore },
      sectionVariants: { [sectionVariantId]: sectionVariant },
      sectionImpls: { [sectionImplId]: sectionImpl },
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
    };

    expect(resolveTextOutputData(configState, sectionId)).toMatchObject({
      text: "From core modifier",
    });

    useAppConfigs.setState({
      configs: {
        [projectConfig.id]: configState,
      },
    });
    syncStoreInitialState(useAppConfigs);

    const markup = renderToStaticMarkup(
      <AppRuntimeContext.Provider value={createRuntimeValue(projectConfig.id)}>
        <TextOutputBlock element={{ props: { sectionId } }} />
      </AppRuntimeContext.Provider>,
    );

    expect(markup).toContain("From core modifier");
    expect(markup).not.toContain("From impl");
  });

  it("keeps the image-output placeholder owned by the extracted output owner", () => {
    const markup = renderToStaticMarkup(
      <AppRuntimeContext.Provider value={createRuntimeValue(null)}>
        <ImageOutputBlock element={{ props: {} }} />
      </AppRuntimeContext.Provider>,
    );

    expect(markup).toContain("Missing image binding.");
  });
});
