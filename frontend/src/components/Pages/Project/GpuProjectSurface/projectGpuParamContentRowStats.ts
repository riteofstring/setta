import {
  resolveFilteredParamRows,
  type FilteredParamRows,
} from "components/Params/paramListFiltering";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrSectionVariantId,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  PROJECT_GPU_PARAM_CONTENT_NESTED_BLOCK_START_GAP_PX,
  type ProjectGpuParamListKey,
} from "./projectGpuParamContentLayout";
import type { ProjectGpuParamContentSectionImpl } from "./projectGpuParamContentSection";

export type ProjectGpuParamRetainedListRowStats = {
  readonly endsWithNestedRow: boolean;
  readonly hasNestedBlockBottomChrome: boolean;
  readonly maxNestedDepth: number;
  readonly rowCount: number;
  readonly verticalGapHeight: number;
};

export function getProjectGpuShownParamRowsIfPresent({
  key,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
}) {
  const sectionVariantId = getCurrSectionVariantId(
    projectState,
    sectionId,
    true,
  );
  if (!projectState.shownParamIds[sectionVariantId]) {
    if (Object.keys(sectionImpl.codeObjVariantMap).length > 0) {
      throw new Error(
        `Missing shown param ids for GPU param content section ${sectionId}.`,
      );
    }
    return null;
  }
  return getCurrShownParamIds(projectState, sectionId, key === "pinned", true);
}

export function normalizeProjectGpuShownParamRows({
  key,
  sectionId,
  shown,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly sectionId: string;
  readonly shown: ReturnType<typeof getCurrShownParamIds>;
}): {
  readonly requiredParamIdsToPaths: Record<string, string[]>;
  readonly topLevelParamIds: string[];
} {
  if (!Array.isArray(shown.topLevelParamIds)) {
    throw new Error(
      `Invalid ${key} shown param ids for GPU param content section ${sectionId}.`,
    );
  }
  const requiredParamIdsToPaths: Record<string, string[]> = {};
  for (const [paramId, path] of Object.entries(
    shown.requiredParamIdsToPaths ?? {},
  )) {
    if (!Array.isArray(path)) {
      throw new Error(
        `Invalid shown param path for GPU param content row ${paramId} in section ${sectionId}.`,
      );
    }
    requiredParamIdsToPaths[paramId] = [...path];
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: [...shown.topLevelParamIds],
  };
}

export function getProjectGpuParamRetainedListRowStats({
  key,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
}): ProjectGpuParamRetainedListRowStats {
  const filteredRows = getProjectGpuParamFilteredRows({
    key,
    projectState,
    sectionId,
    sectionImpl,
  });
  if (!filteredRows || filteredRows.paramIds.length === 0) {
    return EMPTY_PROJECT_GPU_PARAM_RETAINED_LIST_ROW_STATS;
  }
  const tree = buildParamTreeView(
    projectState,
    sectionId,
    filteredRows.paramIds,
    filteredRows.requiredParamIdsToPaths,
  );
  const rows = tree.flat;
  const rowCount = rows.length;
  return {
    endsWithNestedRow: rowCount > 0 && rows[rowCount - 1]?.depth !== 0,
    hasNestedBlockBottomChrome:
      getProjectGpuParamRowsNeedNestedBlockBottomChrome(rows) ||
      getProjectGpuParamTreeHasMultiChildNestedBlock(tree),
    maxNestedDepth: Math.max(0, ...rows.map((row) => row.depth + 1)),
    rowCount,
    verticalGapHeight: getProjectGpuParamRowsVerticalGapHeight(rows),
  };
}

function getProjectGpuParamFilteredRows({
  key,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: ProjectGpuParamContentSectionImpl;
}): FilteredParamRows | null {
  const shown = getProjectGpuShownParamRowsIfPresent({
    key,
    projectState,
    sectionId,
    sectionImpl,
  });
  if (!shown) {
    return null;
  }
  const normalizedShown = normalizeProjectGpuShownParamRows({
    key,
    sectionId,
    shown,
  });
  return resolveFilteredParamRows({
    paramFilter: sectionImpl.paramFilter,
    paramIds: normalizedShown.topLevelParamIds,
    requiredParamIdsToPaths: normalizedShown.requiredParamIdsToPaths,
    sectionId,
    state: projectState,
  });
}

const EMPTY_PROJECT_GPU_PARAM_RETAINED_LIST_ROW_STATS = {
  endsWithNestedRow: false,
  hasNestedBlockBottomChrome: false,
  maxNestedDepth: 0,
  rowCount: 0,
  verticalGapHeight: 0,
} satisfies ProjectGpuParamRetainedListRowStats;

export function getProjectGpuParamRowsVerticalGapHeight(
  rows: readonly {
    readonly depth: number;
    readonly isParent: boolean;
  }[],
): number {
  return rows.reduce(
    (height, row, index) =>
      height +
      getProjectGpuParamRowVerticalGapBefore({
        index,
        row,
      }),
    0,
  );
}

export function getProjectGpuParamRowVerticalGapBefore({
  index,
  row,
}: {
  readonly index: number;
  readonly row: {
    readonly depth: number;
    readonly isParent: boolean;
  };
}): number {
  return index > 0 && row.depth === 0 && row.isParent
    ? PROJECT_GPU_PARAM_CONTENT_NESTED_BLOCK_START_GAP_PX
    : 0;
}

function getProjectGpuParamRowsNeedNestedBlockBottomChrome(
  rows: readonly { readonly depth: number }[],
): boolean {
  let sawNestedRow = false;
  for (const row of rows) {
    if (row.depth > 0) {
      sawNestedRow = true;
      continue;
    }
    if (sawNestedRow) {
      return true;
    }
  }
  return false;
}

function getProjectGpuParamTreeHasMultiChildNestedBlock(
  tree: Pick<
    ReturnType<typeof buildParamTreeView>,
    "rootId" | "visibleChildrenByParent"
  >,
): boolean {
  for (const [parentId, childIds] of Object.entries(
    tree.visibleChildrenByParent,
  )) {
    if (parentId !== tree.rootId && childIds.length > 1) {
      return true;
    }
  }
  return false;
}
