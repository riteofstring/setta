import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import {
  buildPinnedParamsAreaView,
  buildUnpinnedParamsAreaView,
} from "./groupContainerView";
import type {
  ParamEditorKind,
  ParamValuePresentationKind,
} from "./paramEditorActivation";
import {
  buildVisibleParamScenePackets,
  type ParamSceneRowPacket,
} from "./paramSwitchScenePackets";

export type LiveDictAreaSceneParamAreaPacket = {
  grow: boolean;
  id: ParamListKey;
  listKey: ParamListKey;
  maxNestedDepth: number;
  minHeight: number | null;
  requiredParamIdsToPaths: Record<string, string[]>;
  rowCount: number;
  rows: ParamSceneRowPacket[];
  shouldApplyMinHeight: boolean;
  shouldRoundBottom: boolean;
  title: string;
  topLevelParamIds: string[];
};

export type LiveDictAreaScenePacket = {
  paramAreas: LiveDictAreaSceneParamAreaPacket[];
};

type BuildParamAreaScenePacketArgs = {
  getParamEditorKind: (paramId: string) => ParamEditorKind;
  getParamDisplayName: (paramId: string) => string;
  getParamValuePresentationKind?: (
    paramId: string,
  ) => ParamValuePresentationKind;
  getParamValuePreview?: (paramId: string) => string | null;
  getParamValueSwatch?: (paramId: string) => string | null;
  grow: boolean;
  id: ParamListKey;
  listKey: ParamListKey;
  maxNestedDepth: number;
  minHeight: number | null;
  paramFilter: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  shouldApplyMinHeight: boolean;
  shouldRoundBottom: boolean;
  title: string;
  topLevelParamIds: string[];
};

export function buildLiveDictAreaScenePacket({
  edgeInputParams,
  getParamEditorKind,
  hideUnpinnedParams,
  paramFilter,
  getParamDisplayName,
  getParamValuePresentationKind,
  getParamValuePreview,
  getParamValueSwatch,
  pinned,
  unpinned,
}: {
  edgeInputParams: string[];
  getParamEditorKind: (paramId: string) => ParamEditorKind;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  getParamDisplayName: (paramId: string) => string;
  getParamValuePresentationKind?: (
    paramId: string,
  ) => ParamValuePresentationKind;
  getParamValuePreview?: (paramId: string) => string | null;
  getParamValueSwatch?: (paramId: string) => string | null;
  pinned: {
    requiredParamIdsToPaths: Record<string, string[]>;
    topLevelParamIds: string[];
  };
  unpinned: {
    canEditLayout: boolean;
    configuredMinHeight: number | null | undefined;
    pinnedRequiredParamIdsToPaths: Record<string, string[]>;
    pinnedTopLevelParamIds: string[];
    positionAndSizeLocked: boolean;
    requiredParamIdsToPaths: Record<string, string[]>;
    topLevelParamIds: string[];
  };
}): LiveDictAreaScenePacket {
  const paramAreas: LiveDictAreaSceneParamAreaPacket[] = [];
  const pinnedPacket = buildPinnedParamsAreaScenePacket({
    edgeInputParams,
    getParamEditorKind,
    getParamDisplayName,
    getParamValuePresentationKind,
    getParamValuePreview,
    getParamValueSwatch,
    hideUnpinnedParams,
    paramFilter,
    requiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
    topLevelParamIds: pinned.topLevelParamIds,
  });

  if (pinnedPacket) {
    paramAreas.push(pinnedPacket);
  }

  const unpinnedPacket = buildUnpinnedParamsAreaScenePacket({
    canEditLayout: unpinned.canEditLayout,
    configuredMinHeight: unpinned.configuredMinHeight,
    edgeInputParams,
    getParamEditorKind,
    getParamDisplayName,
    getParamValuePresentationKind,
    getParamValuePreview,
    getParamValueSwatch,
    hideUnpinnedParams,
    paramFilter,
    pinnedRequiredParamIdsToPaths: unpinned.pinnedRequiredParamIdsToPaths,
    pinnedTopLevelParamIds: unpinned.pinnedTopLevelParamIds,
    positionAndSizeLocked: unpinned.positionAndSizeLocked,
    requiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
    topLevelParamIds: unpinned.topLevelParamIds,
  });

  if (unpinnedPacket) {
    paramAreas.push(unpinnedPacket);
  }

  return { paramAreas };
}

export function buildPinnedParamsAreaScenePacket({
  edgeInputParams,
  getParamEditorKind,
  getParamDisplayName,
  getParamValuePresentationKind,
  getParamValuePreview,
  getParamValueSwatch,
  hideUnpinnedParams,
  paramFilter,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  edgeInputParams: string[];
  getParamEditorKind: (paramId: string) => ParamEditorKind;
  getParamDisplayName: (paramId: string) => string;
  getParamValuePresentationKind?: (
    paramId: string,
  ) => ParamValuePresentationKind;
  getParamValuePreview?: (paramId: string) => string | null;
  getParamValueSwatch?: (paramId: string) => string | null;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}): LiveDictAreaSceneParamAreaPacket | null {
  const pinnedView = buildPinnedParamsAreaView({
    requiredParamIdsToPaths,
    topLevelParamIds,
    edgeInputParams,
    hideUnpinnedParams,
  });

  if (pinnedView.topLevelParamIds.length === 0) {
    return null;
  }

  return buildParamAreaScenePacket({
    getParamEditorKind,
    getParamDisplayName,
    getParamValuePresentationKind,
    getParamValuePreview,
    getParamValueSwatch,
    grow: false,
    id: "pinned",
    listKey: "pinned",
    maxNestedDepth: pinnedView.maxNestedDepth,
    minHeight: null,
    paramFilter,
    requiredParamIdsToPaths: pinnedView.requiredParamIdsToPaths,
    shouldApplyMinHeight: false,
    shouldRoundBottom: pinnedView.shouldRoundBottom,
    title: "Pinned Params",
    topLevelParamIds: pinnedView.topLevelParamIds,
  });
}

export function buildUnpinnedParamsAreaScenePacket({
  canEditLayout,
  configuredMinHeight,
  edgeInputParams,
  getParamEditorKind,
  getParamDisplayName,
  getParamValuePresentationKind,
  getParamValuePreview,
  getParamValueSwatch,
  hideUnpinnedParams,
  paramFilter,
  pinnedRequiredParamIdsToPaths,
  pinnedTopLevelParamIds,
  positionAndSizeLocked,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  canEditLayout: boolean;
  configuredMinHeight: number | null | undefined;
  edgeInputParams: string[];
  getParamEditorKind: (paramId: string) => ParamEditorKind;
  getParamDisplayName: (paramId: string) => string;
  getParamValuePresentationKind?: (
    paramId: string,
  ) => ParamValuePresentationKind;
  getParamValuePreview?: (paramId: string) => string | null;
  getParamValueSwatch?: (paramId: string) => string | null;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  pinnedRequiredParamIdsToPaths: Record<string, string[]>;
  pinnedTopLevelParamIds: string[];
  positionAndSizeLocked: boolean;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}): LiveDictAreaSceneParamAreaPacket | null {
  if (hideUnpinnedParams) {
    return null;
  }

  const unpinnedView = buildUnpinnedParamsAreaView({
    pinnedRequiredParamIdsToPaths,
    pinnedTopLevelParamIds,
    requiredParamIdsToPaths,
    topLevelParamIds,
    edgeInputParams,
    hideUnpinnedParams,
    canEditLayout,
    positionAndSizeLocked,
    configuredMinHeight,
  });

  return buildParamAreaScenePacket({
    getParamEditorKind,
    getParamDisplayName,
    getParamValuePresentationKind,
    getParamValuePreview,
    getParamValueSwatch,
    grow: true,
    id: "unpinned",
    listKey: "unpinned",
    maxNestedDepth: unpinnedView.maxNestedDepth,
    minHeight: unpinnedView.minHeight,
    paramFilter,
    requiredParamIdsToPaths: unpinnedView.requiredParamIdsToPaths,
    shouldApplyMinHeight: unpinnedView.shouldApplyMinHeight,
    shouldRoundBottom: false,
    title: "Params",
    topLevelParamIds: unpinnedView.topLevelParamIds,
  });
}

function buildParamAreaScenePacket({
  getParamEditorKind,
  getParamDisplayName,
  getParamValuePresentationKind,
  getParamValuePreview,
  getParamValueSwatch,
  grow,
  id,
  listKey,
  maxNestedDepth,
  minHeight,
  paramFilter,
  requiredParamIdsToPaths,
  shouldApplyMinHeight,
  shouldRoundBottom,
  title,
  topLevelParamIds,
}: BuildParamAreaScenePacketArgs): LiveDictAreaSceneParamAreaPacket {
  const rows = buildVisibleParamScenePackets({
    getParamEditorKind,
    getParamValuePresentationKind,
    paramIds: buildParamSceneInputIds({
      topLevelParamIds,
      requiredParamIdsToPaths,
    }),
    requiredParamIdsToPaths,
    paramFilter,
    getParamDisplayName,
    getParamValuePreview,
    getParamValueSwatch,
  });

  return {
    grow,
    id,
    listKey,
    maxNestedDepth,
    minHeight,
    requiredParamIdsToPaths,
    rowCount: rows.length,
    rows,
    shouldApplyMinHeight,
    shouldRoundBottom,
    title,
    topLevelParamIds,
  };
}

function buildParamSceneInputIds({
  topLevelParamIds,
  requiredParamIdsToPaths,
}: {
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
}): string[] {
  const childIdsByParentId = new Map<string, string[]>();

  for (const path of Object.values(requiredParamIdsToPaths)) {
    path.forEach((paramId, index) => {
      if (!childIdsByParentId.has(paramId)) {
        childIdsByParentId.set(paramId, []);
      }
      if (index === 0) {
        return;
      }

      const parentId = path[index - 1];
      const childIds = childIdsByParentId.get(parentId) ?? [];
      if (!childIds.includes(paramId)) {
        childIds.push(paramId);
      }
      childIdsByParentId.set(parentId, childIds);
    });
  }

  const flattenedParamIds: string[] = [];
  const visitedParamIds = new Set<string>();
  const visitParamId = (paramId: string) => {
    if (visitedParamIds.has(paramId)) {
      return;
    }
    visitedParamIds.add(paramId);
    flattenedParamIds.push(paramId);
    const childIds = childIdsByParentId.get(paramId) ?? [];
    childIds.forEach(visitParamId);
  };

  topLevelParamIds.forEach(visitParamId);

  return flattenedParamIds;
}
