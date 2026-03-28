import { SectionTypeEnum } from "utils/generatedTypes";

const DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 36;
const LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;
const UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED = 36;

type RequiredParamIdsToPaths = Record<string, string[]>;

type BuildFilteredParamListViewArgs = {
  requiredParamIdsToPaths: RequiredParamIdsToPaths;
  topLevelParamIds: string[];
  edgeInputParams: string[];
};

type BuildPinnedParamsAreaViewArgs = BuildFilteredParamListViewArgs & {
  hideUnpinnedParams: boolean;
};

type BuildUnpinnedParamsAreaViewArgs = {
  pinnedRequiredParamIdsToPaths: RequiredParamIdsToPaths;
  pinnedTopLevelParamIds: string[];
  requiredParamIdsToPaths: RequiredParamIdsToPaths;
  topLevelParamIds: string[];
  edgeInputParams: string[];
  hideUnpinnedParams: boolean;
  canEditLayout: boolean;
  positionAndSizeLocked: boolean;
  configuredMinHeight: number | null | undefined;
};

export type FilteredParamListView = {
  requiredParamIdsToPaths: RequiredParamIdsToPaths;
  topLevelParamIds: string[];
  maxNestedDepth: number;
};

export type PinnedParamsAreaView = FilteredParamListView & {
  shouldRoundBottom: boolean;
};

export type UnpinnedParamsAreaView = FilteredParamListView & {
  hasPinnedParams: boolean;
  minHeight: number;
  shouldApplyMinHeight: boolean;
};

export function getPinnedParamsBgClassName(
  sectionTypeName: SectionTypeEnum,
): string {
  if (sectionTypeName === SectionTypeEnum.Callable) {
    return "bg-white dark:bg-blue-950/30";
  }
  if (sectionTypeName === SectionTypeEnum.GlobalVariables) {
    return "bg-setta-50 dark:bg-blue-950/30";
  }
  return "bg-setta-100/50 dark:bg-blue-950/30";
}

export function buildFilteredParamListView({
  requiredParamIdsToPaths,
  topLevelParamIds,
  edgeInputParams,
}: BuildFilteredParamListViewArgs): FilteredParamListView {
  const filteredList = filterEdgeInputs({
    requiredParamIdsToPaths,
    topLevelParamIds,
    edgeInputParams,
  });

  return {
    ...filteredList,
    maxNestedDepth: getLongestParamPathLength(
      filteredList.requiredParamIdsToPaths,
    ),
  };
}

export function buildPinnedParamsAreaView({
  requiredParamIdsToPaths,
  topLevelParamIds,
  edgeInputParams,
  hideUnpinnedParams,
}: BuildPinnedParamsAreaViewArgs): PinnedParamsAreaView {
  return {
    ...buildFilteredParamListView({
      requiredParamIdsToPaths,
      topLevelParamIds,
      edgeInputParams,
    }),
    shouldRoundBottom: hideUnpinnedParams,
  };
}

export function buildUnpinnedParamsAreaView({
  pinnedRequiredParamIdsToPaths,
  pinnedTopLevelParamIds,
  requiredParamIdsToPaths,
  topLevelParamIds,
  edgeInputParams,
  hideUnpinnedParams,
  canEditLayout,
  positionAndSizeLocked,
  configuredMinHeight,
}: BuildUnpinnedParamsAreaViewArgs): UnpinnedParamsAreaView {
  const pinnedView = buildFilteredParamListView({
    requiredParamIdsToPaths: pinnedRequiredParamIdsToPaths,
    topLevelParamIds: pinnedTopLevelParamIds,
    edgeInputParams,
  });
  const unpinnedView = buildFilteredParamListView({
    requiredParamIdsToPaths,
    topLevelParamIds,
    edgeInputParams,
  });
  const hasPinnedParams = pinnedView.topLevelParamIds.length > 0;

  return {
    ...unpinnedView,
    hasPinnedParams,
    minHeight: resolveUnpinnedParamsAreaMinHeight({
      configuredMinHeight,
      hasPinnedParams,
    }),
    shouldApplyMinHeight:
      !hideUnpinnedParams && canEditLayout && !positionAndSizeLocked,
  };
}

function filterEdgeInputs({
  requiredParamIdsToPaths,
  topLevelParamIds,
  edgeInputParams,
}: BuildFilteredParamListViewArgs): Pick<
  FilteredParamListView,
  "requiredParamIdsToPaths" | "topLevelParamIds"
> {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }

  const edgeInputSet = new Set(edgeInputParams);
  const filteredParamIdsToPaths: RequiredParamIdsToPaths = {};
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    if (!edgeInputSet.has(paramId)) {
      filteredParamIdsToPaths[paramId] = path;
    }
  }

  return {
    requiredParamIdsToPaths: filteredParamIdsToPaths,
    topLevelParamIds: topLevelParamIds.filter(
      (paramId) => !edgeInputSet.has(paramId),
    ),
  };
}

function getLongestParamPathLength(
  requiredParamIdsToPaths: RequiredParamIdsToPaths,
): number {
  return Object.values(requiredParamIdsToPaths).reduce(
    (max, path) => (path.length > max ? path.length : max),
    0,
  );
}

function resolveUnpinnedParamsAreaMinHeight({
  configuredMinHeight,
  hasPinnedParams,
}: {
  configuredMinHeight: number | null | undefined;
  hasPinnedParams: boolean;
}): number {
  const baseMinHeight = Number.isFinite(configuredMinHeight)
    ? configuredMinHeight
    : DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT;
  const normalizedMinHeight =
    baseMinHeight === LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT
      ? DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
      : baseMinHeight;

  if (
    hasPinnedParams &&
    normalizedMinHeight === DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
  ) {
    return UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED;
  }

  return normalizedMinHeight;
}
