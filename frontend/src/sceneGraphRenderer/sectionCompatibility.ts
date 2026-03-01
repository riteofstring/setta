import type { Node } from "forks/xyflow/core/types";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type SectionType,
  type Variant,
} from "utils/generatedTypes";

type SceneGraphSectionRenderMode = "scene" | "dom";

const SCENE_GRAPH_SECTION_RENDER_MODE_BY_TYPE: Record<
  SectionType,
  SceneGraphSectionRenderMode
> = {
  [SectionTypeEnum.Callable]: "scene",
  [SectionTypeEnum.Dict]: "scene",
  [SectionTypeEnum.ListRoot]: "scene",
  [SectionTypeEnum.Group]: "scene",
  [SectionTypeEnum.Image]: "dom",
  [SectionTypeEnum.Chart]: "dom",
  [SectionTypeEnum.Draw]: "dom",
  [SectionTypeEnum.TextBlock]: "scene",
  [SectionTypeEnum.Prompt]: "scene",
  [SectionTypeEnum.MetaControl]: "scene",
  [SectionTypeEnum.Social]: "dom",
  [SectionTypeEnum.GlobalVariables]: "scene",
  [SectionTypeEnum.Code]: "scene",
  [SectionTypeEnum.GenPythonCode]: "scene",
  [SectionTypeEnum.GenPythonMetadata]: "scene",
  [SectionTypeEnum.Terminal]: "scene",
  [SectionTypeEnum.IFrame]: "dom",
  [SectionTypeEnum.Chat]: "dom",
  [SectionTypeEnum.Browser]: "dom",
  [SectionTypeEnum.Plugin]: "dom",
  [SectionTypeEnum.TaskBoard]: "dom",
  [SectionTypeEnum.Spreadsheet]: "dom",
};

const EMPTY_FORCED_DOM_SECTION_IDS: ReadonlySet<string> = new Set();

type SceneGraphSectionCompatibilitySnapshot = {
  forcedDomSectionIds: ReadonlySet<string>;
  sceneCompatibleSectionCount: number;
  domOnlySectionCount: number;
  unresolvedSectionCount: number;
};

export const EMPTY_SCENE_GRAPH_SECTION_COMPATIBILITY_SNAPSHOT: SceneGraphSectionCompatibilitySnapshot =
  {
    forcedDomSectionIds: EMPTY_FORCED_DOM_SECTION_IDS,
    sceneCompatibleSectionCount: 0,
    domOnlySectionCount: 0,
    unresolvedSectionCount: 0,
  };

function getSceneGraphSectionRenderModeForType(
  sectionType: SectionType,
): SceneGraphSectionRenderMode {
  return SCENE_GRAPH_SECTION_RENDER_MODE_BY_TYPE[sectionType];
}

export function isSceneGraphSectionTypeSceneCompatible(
  sectionType: SectionType,
): boolean {
  return getSceneGraphSectionRenderModeForType(sectionType) === "scene";
}

export function computeSceneGraphSectionCompatibilitySnapshot(input: {
  nodesById: Map<string, Node>;
  sectionVariantMap: Record<string, string>;
  sectionVariants: Record<string, Variant>;
  sectionImpls: Record<string, BaseSectionImplUnion>;
}): SceneGraphSectionCompatibilitySnapshot {
  const forcedDomSectionIds = new Set<string>();
  let sceneCompatibleSectionCount = 0;
  let domOnlySectionCount = 0;
  let unresolvedSectionCount = 0;

  for (const sectionId of input.nodesById.keys()) {
    const sectionType = resolveSectionTypeForSectionId(sectionId, input);
    if (sectionType === null) {
      unresolvedSectionCount += 1;
      forcedDomSectionIds.add(sectionId);
      continue;
    }

    if (isSceneGraphSectionTypeSceneCompatible(sectionType)) {
      sceneCompatibleSectionCount += 1;
      continue;
    }

    domOnlySectionCount += 1;
    forcedDomSectionIds.add(sectionId);
  }

  return {
    forcedDomSectionIds,
    sceneCompatibleSectionCount,
    domOnlySectionCount,
    unresolvedSectionCount,
  };
}

function resolveSectionTypeForSectionId(
  sectionId: string,
  input: {
    sectionVariantMap: Record<string, string>;
    sectionVariants: Record<string, Variant>;
    sectionImpls: Record<string, BaseSectionImplUnion>;
  },
): SectionType | null {
  const variantId = input.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }

  const variant = input.sectionVariants[variantId];
  if (!variant) {
    return null;
  }

  const sectionImpl = input.sectionImpls[variant.impl];
  if (!sectionImpl) {
    return null;
  }

  return sectionImpl.type;
}
