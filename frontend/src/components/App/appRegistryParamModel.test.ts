import { describe, expect, it } from "vitest";

import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";

import {
  resolveAppBoundParamState,
  resolveAppParamEditState,
} from "./appRegistryParamModel";

function createAppConfigState(args: {
  sectionId: string;
  sectionVariantId: string;
  sectionImplId: string;
  sectionImpl: ReturnType<typeof createCallableSectionImpl>;
  paramId: string;
  paramVariantId: string;
  paramImplId: string;
  paramCoreDisplayName?: string;
  paramImpl: Record<string, unknown>;
}) {
  const projectConfig = createProjectConfig({
    id: "config-1",
    sectionVariantMap: { [args.sectionId]: args.sectionVariantId },
  });
  const sectionCore = createCore({
    id: args.sectionId,
    name: "Section",
    variants: [args.sectionVariantId],
    defaultVariant: args.sectionVariantId,
  });
  const sectionVariant = createVariant({
    id: args.sectionVariantId,
    name: "Section Variant",
    impl: args.sectionImplId,
    nonPresetImpls: [],
  });
  const paramCore = createCore({
    id: args.paramId,
    name: args.paramCoreDisplayName ?? "Search Query",
    displayName: args.paramCoreDisplayName ?? "Search Query",
    variants: [args.paramVariantId],
    defaultVariant: args.paramVariantId,
  });
  const paramVariant = createVariant({
    id: args.paramVariantId,
    name: "Param Variant",
    impl: args.paramImplId,
    nonPresetImpls: [],
  });

  return {
    projectConfig,
    sections: { [args.sectionId]: sectionCore },
    sectionVariants: { [args.sectionVariantId]: sectionVariant },
    sectionImpls: { [args.sectionImplId]: args.sectionImpl },
    codeObjs: { [args.paramId]: paramCore },
    codeObjVariants: { [args.paramVariantId]: paramVariant },
    codeObjImpls: { [args.paramImplId]: args.paramImpl },
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: { [args.sectionId]: null },
    shownParamIds: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
    genCodeBinding: null,
  };
}

describe("appRegistryParamModel", () => {
  it("resolves the bound param display state for the extracted param owner", () => {
    // This keeps the new param owner responsible for the same config lookup path.
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const paramId = "param-1";
    const paramVariantId = "param-variant-1";
    const paramImplId = "param-impl-1";
    const sectionImpl = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: sectionImplId,
        codeObjVariantMap: { [paramId]: paramVariantId },
      },
    );
    const configState = createAppConfigState({
      sectionId,
      sectionVariantId,
      sectionImplId,
      sectionImpl,
      paramId,
      paramVariantId,
      paramImplId,
      paramImpl: {
        type: "TextParam",
        id: paramImplId,
        name: "Search Query",
        description: "",
        isPreset: false,
        coreNameType: "TEXT",
        coreNameEditable: false,
        passingStyle: "DEFAULT",
        typeAnnotation: "",
        defaultVal: "",
        value: "alpha",
        uiType: "plain",
      },
    });

    const result = resolveAppBoundParamState(configState, sectionId, paramId);

    expect(result.canRenderParam).toBe(true);
    expect(result.displayName).toBe("Search Query");
    expect(result.sectionImpl?.id).toBe(sectionImplId);
    expect(result.codeObjImpl?.type).toBe("TextParam");
  });

  it("returns a non-renderable state when the param variant mapping is missing", () => {
    // This guards the fallback copy that the root registry still shows on bad bindings.
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const paramId = "param-1";
    const paramVariantId = "param-variant-1";
    const paramImplId = "param-impl-1";
    const sectionImpl = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: sectionImplId,
        codeObjVariantMap: {},
      },
    );
    const configState = createAppConfigState({
      sectionId,
      sectionVariantId,
      sectionImplId,
      sectionImpl,
      paramId,
      paramVariantId,
      paramImplId,
      paramImpl: {
        type: "TextParam",
        id: paramImplId,
        name: "Search Query",
        description: "",
        isPreset: false,
        coreNameType: "TEXT",
        coreNameEditable: false,
        passingStyle: "DEFAULT",
        typeAnnotation: "",
        defaultVal: "",
        value: "alpha",
        uiType: "plain",
      },
    });

    const result = resolveAppBoundParamState(configState, sectionId, paramId);

    expect(result.canRenderParam).toBe(false);
    expect(result.displayName).toBeNull();
    expect(result.sectionImpl).toBeNull();
    expect(result.codeObjImpl).toBeNull();
  });

  it("keeps the app-only code-param edit gate stable", () => {
    // This preserves the deployment-only edit block after moving the logic out of appRegistry.tsx.
    const codeParam = createCodeParamCodeObjImpl(
      createUserDefaultCodeParamCodeObjImpl(),
      {
        id: "code-param-1",
        value: "alpha",
      },
    );

    expect(
      resolveAppParamEditState({
        canEditParams: true,
        modeResolved: true,
        serverMode: "app",
        codeObjImpl: codeParam,
      }),
    ).toEqual({
      codeParamBlocked: true,
      effectiveCanEditParams: false,
    });

    expect(
      resolveAppParamEditState({
        canEditParams: true,
        modeResolved: false,
        serverMode: "app",
        codeObjImpl: codeParam,
      }),
    ).toEqual({
      codeParamBlocked: false,
      effectiveCanEditParams: true,
    });
  });
});
