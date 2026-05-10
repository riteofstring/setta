import type { GpuRetainedContentInteractionHit } from "gpuFlow/interactions/retainedContentInteraction";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentHitRecord,
  GpuRetainedContentScene,
} from "gpuFlow/retainedContentScene";
import type { GpuDomIsland, GpuFlowScene } from "gpuFlow/scene";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import {
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  HTTPRequestMethodEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  createButtonParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createNestedParamCodeObjImpl,
  createProjectConfig,
  createSingleConfig,
  createVariant,
} from "utils/generatedTypes";

export function retainedContentTestScene(
  retainedScene: GpuRetainedContentScene,
): GpuFlowScene {
  return {
    contentSurfaces: [
      {
        clipRect: {
          height: retainedScene.viewportRect.height,
          width: retainedScene.viewportRect.width,
          x: 0,
          y: 0,
        },
        id: retainedScene.id,
        ownerSectionId: retainedScene.ownerSectionId,
        rect: {
          height: retainedScene.viewportRect.height,
          width: retainedScene.viewportRect.width,
          x: 0,
          y: 0,
        },
        retainedScene,
        renderer: {
          kind: "canvas-content",
          surfaceId: retainedScene.id,
        },
        zIndex: 1,
      },
    ],
    domIslands: [],
    edges: [],
    revision: 0,
    sections: [],
  };
}

export function retainedContentInteractionHit(
  retainedScene: GpuRetainedContentScene,
  hit: GpuRetainedContentHitRecord,
): GpuRetainedContentInteractionHit {
  return {
    flowPoint: { x: hit.rect.x, y: hit.rect.y },
    hit,
    localPoint: { x: hit.rect.x, y: hit.rect.y },
    ownerSectionId: retainedScene.ownerSectionId,
    retainedScene,
    screenPoint: { x: hit.rect.x, y: hit.rect.y },
    surfaceId: retainedScene.id,
    zIndex: 1,
  };
}

export function getRetainedControlHit(
  retainedScene: GpuRetainedContentScene,
): GpuRetainedContentHitRecord {
  const controlHit = retainedScene.hitRecords.find(
    (candidate) => candidate.kind === "control",
  );
  if (!controlHit) {
    throw new Error("Expected retained control hit.");
  }
  return controlHit;
}

export function resolveDisabledOption(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

export function textLikeControlDescriptor(
  displayValue: string,
): GpuRetainedContentControlDescriptor {
  return {
    defaultDisplayValue: "",
    displayValue,
    editorKind: "text",
    kind: "text-like",
    policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
    rendererFamily: "text-like",
    commitPolicy: "native-island",
  };
}

export function displayOnlyTimeControlDescriptor(): GpuRetainedContentControlDescriptor {
  return {
    calendar: null,
    defaultDisplayValue: "--:--",
    displayValue: "12:00",
    kind: "date-time",
    label: "Display time",
    mode: "time-display",
    rendererFamily: "date-time",
    summaryText: null,
    commitPolicy: "native-island",
  };
}

export function retainedParamIsland(
  overrides: Partial<GpuDomIsland> = {},
): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 160, x: 0, y: 0 },
    id: "param-control:section-1:param-1",
    kind: "retained-content-control",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 160, x: 10, y: 20 },
    source: {
      hitRecordId: "control:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
    ...overrides,
  };
}

export function retainedParamNameIsland(
  overrides: Partial<GpuDomIsland> = {},
): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 120, x: 0, y: 0 },
    id: "param-label:section-1:param-1",
    kind: "retained-content-label",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 120, x: 10, y: 20 },
    source: {
      hitRecordId: "label:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
    ...overrides,
  };
}

export function seedButtonParamProjectState() {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: createButtonParamCodeObjImpl({
          actionMode: ButtonActionModeEnum.HTTP_REQUEST,
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          defaultVal: "",
          description: "",
          id: paramImplId,
          isPreset: false,
          label: "Run",
          name: "param-1",
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          requestBody: '{"ok":true}',
          requestHeaderKey: "X-Test",
          requestHeaderValue: "yes",
          requestMethod: HTTPRequestMethodEnum.POST,
          requestUrl: "/run-button",
          type: CodeObjTypeEnum.ButtonParam,
          typeAnnotation: "",
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}
