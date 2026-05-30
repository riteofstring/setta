import { getEffectiveImpl } from "@setta/app-subsystem-frontend-sdk";
import {
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  type BaseSectionImplUnion,
  type Core,
  type TopLevelSectionLayout,
  type Variant,
} from "utils/generatedTypes";
import type {
  EffectiveCodeObjSnapshot,
  EffectiveSectionSnapshot,
  NormalizedShownParamDetails,
  WorkspaceSceneProjectState,
} from "./workspaceSceneTypes";

export function getActiveViewModeTopLevelSections(
  projectState: WorkspaceSceneProjectState,
): Record<string, TopLevelSectionLayout> {
  const { activeViewModeId, topLevelSections, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId || !(activeViewModeId in viewModes)) {
    return topLevelSections;
  }
  const viewMode = viewModes[activeViewModeId];
  const viewModeLayout = viewMode?.topLevelSections;
  if (!viewModeLayout || Object.keys(viewModeLayout).length === 0) {
    return topLevelSections;
  }
  if (!topLevelSections || Object.keys(topLevelSections).length === 0) {
    return viewModeLayout;
  }
  return { ...topLevelSections, ...viewModeLayout };
}

export function getRootSectionIdsForScene(
  projectState: WorkspaceSceneProjectState,
  topLevelSections: Record<string, TopLevelSectionLayout>,
): Array<string> {
  return Object.keys(topLevelSections)
    .filter((sectionId) => isRootSceneSection(projectState, sectionId))
    .sort((left, right) =>
      compareTopLevelSectionIds(topLevelSections, left, right),
    );
}

export function getSectionChildIds(
  projectState: WorkspaceSceneProjectState,
  sectionId: string,
  impl: BaseSectionImplUnion,
): Array<string> {
  if (!isBaseParentSectionImpl(impl)) {
    return [];
  }
  return (impl.children ?? []).filter((childId) => {
    if ((projectState.parentSectionMap[childId] ?? null) !== sectionId) {
      return false;
    }
    return Boolean(getEffectiveSectionSnapshot(projectState, childId));
  });
}

export function getEffectiveSectionSnapshot(
  projectState: WorkspaceSceneProjectState,
  sectionId: string,
): EffectiveSectionSnapshot | null {
  const core = projectState.sections[sectionId];
  if (!core) {
    return null;
  }
  const variantId =
    projectState.previewSectionVariantMap?.[sectionId] ??
    projectState.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = projectState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = projectState.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return {
    core,
    variant,
    impl,
    effectiveImpl: getWorkspaceEffectiveImpl(impl, core, variant),
  };
}

export function getEffectiveCodeObjSnapshot(
  projectState: WorkspaceSceneProjectState,
  sectionImpl: BaseSectionImplUnion,
  codeObjId: string,
): EffectiveCodeObjSnapshot | null {
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    return null;
  }
  const variantId = sectionImpl.codeObjVariantMap[codeObjId];
  if (!variantId) {
    return null;
  }
  const core = projectState.codeObjs[codeObjId];
  const variant = projectState.codeObjVariants[variantId];
  if (!core || !variant) {
    return null;
  }
  const impl = projectState.codeObjImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return {
    core,
    variant,
    impl,
    effectiveImpl: getWorkspaceEffectiveImpl(impl, core, variant),
  };
}

export function getShownParamIdsForSection(
  projectState: WorkspaceSceneProjectState,
  sectionId: string,
) {
  const variantId =
    projectState.previewSectionVariantMap?.[sectionId] ??
    projectState.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    throw new Error(
      `Workspace scene cannot derive Dict section ${sectionId}: missing section variant id.`,
    );
  }
  const shown = projectState.shownParamIds[variantId];
  if (!shown) {
    throw new Error(
      `Workspace scene cannot derive Dict section ${sectionId}: missing shown Param ids for variant ${variantId}.`,
    );
  }
  return shown;
}

export function normalizeShownParamDetails(details: {
  requiredParamIdsToPaths: Record<string, Array<string> | null>;
  topLevelParamIds: Array<string> | null;
}): NormalizedShownParamDetails {
  const requiredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(
    details.requiredParamIdsToPaths,
  )) {
    requiredParamIdsToPaths[paramId] =
      path && path.length > 0 ? [...path] : [paramId];
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: [...(details.topLevelParamIds ?? [])],
  };
}

export function filterEdgeInputParams(
  details: NormalizedShownParamDetails,
  edgeInputParams: Set<string>,
): NormalizedShownParamDetails {
  if (edgeInputParams.size === 0) {
    return details;
  }
  const requiredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(
    details.requiredParamIdsToPaths,
  )) {
    if (!edgeInputParams.has(paramId)) {
      requiredParamIdsToPaths[paramId] = path;
    }
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: details.topLevelParamIds.filter(
      (paramId) => !edgeInputParams.has(paramId),
    ),
  };
}

function isRootSceneSection(
  projectState: WorkspaceSceneProjectState,
  sectionId: string,
) {
  if ((projectState.parentSectionMap[sectionId] ?? null) !== null) {
    return false;
  }
  if (!getEffectiveSectionSnapshot(projectState, sectionId)) {
    return false;
  }
  return shouldRenderSectionForActiveViewMode(projectState, sectionId);
}

function shouldRenderSectionForActiveViewMode(
  projectState: WorkspaceSceneProjectState,
  sectionId: string,
) {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId) {
    return true;
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    return true;
  }
  const visibility = viewMode.visibilityBySectionId?.[sectionId];
  return visibility === undefined ? false : isEditingViewMode || visibility;
}

function compareTopLevelSectionIds(
  layouts: Record<string, TopLevelSectionLayout>,
  left: string,
  right: string,
) {
  const leftLayout = layouts[left];
  const rightLayout = layouts[right];
  if (!leftLayout || !rightLayout) {
    return left.localeCompare(right);
  }
  return (
    (leftLayout.zIndex ?? 0) - (rightLayout.zIndex ?? 0) ||
    leftLayout.y - rightLayout.y ||
    leftLayout.x - rightLayout.x ||
    left.localeCompare(right)
  );
}

function getWorkspaceEffectiveImpl<T extends object>(
  impl: T,
  core: Core,
  variant: Variant,
): T {
  return getEffectiveImpl(
    impl as Parameters<typeof getEffectiveImpl>[0],
    core as unknown as Parameters<typeof getEffectiveImpl>[1],
    variant as unknown as Parameters<typeof getEffectiveImpl>[2],
  ) as T;
}
