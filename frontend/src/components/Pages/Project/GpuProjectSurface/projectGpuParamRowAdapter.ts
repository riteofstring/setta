import {
  getSectionParamUIRendererFamily,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import type {
  GpuRetainedContentRowInput,
  GpuRetainedContentRowState,
} from "gpuFlow/retainedContentScene";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import type {
  ZustandProjectSearch,
  ZustandProjectState,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import { type CodeObjType } from "utils/generatedTypes";

export type ProjectGpuRetainedParamSearchState = Pick<
  ZustandProjectSearch,
  "focused" | "lookup"
>;

type ProjectGpuRetainedParamTargetLike = {
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly surfaceId: string;
};

type ProjectGpuParamTreeRowLike = {
  readonly depth: number;
  readonly id: string;
  readonly isParent: boolean;
};

export function createProjectGpuParamRowInput({
  activeParamDomIsland,
  codeObjImpl,
  disabled,
  draggingParamIds,
  edgeInputParamIds,
  hoveredParamTarget,
  projectSearch,
  projectState,
  row,
  sectionId,
  sectionParamTypeErrors,
  selectedParamIds,
  surfaceId,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuRetainedParamTargetLike
    | null
    | undefined;
  readonly codeObjImpl: { readonly type: string };
  readonly disabled?: boolean | undefined;
  readonly draggingParamIds: ReadonlySet<string> | null;
  readonly edgeInputParamIds: ReadonlySet<string>;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTargetLike
    | null
    | undefined;
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly projectState: ZustandProjectState;
  readonly row: ProjectGpuParamTreeRowLike;
  readonly sectionId: string;
  readonly sectionParamTypeErrors: Readonly<
    Record<string, readonly unknown[] | undefined>
  >;
  readonly selectedParamIds: ReadonlySet<string>;
  readonly surfaceId: string;
}): GpuRetainedContentRowInput {
  const codeObjType = codeObjImpl.type as CodeObjType;
  return {
    controlKind: getProjectGpuParamControlKind({
      isParent: row.isParent,
      rendererFamily: getSectionParamUIRendererFamily(codeObjType),
    }),
    depth: row.depth,
    id: row.id,
    label:
      getParamDisplayNameIfPresent(projectState, sectionId, row.id) ?? row.id,
    ports: edgeInputParamIds.has(row.id)
      ? [{ id: row.id, kind: "input", side: "left" }]
      : [],
    state: createProjectGpuParamRowState({
      activeParamDomIsland,
      disabled,
      draggingParamIds,
      hoveredParamTarget,
      projectSearch,
      rowId: row.id,
      sectionId,
      sectionParamTypeErrors,
      selectedParamIds,
      surfaceId,
    }),
  };
}

function createProjectGpuParamRowState({
  activeParamDomIsland,
  disabled,
  draggingParamIds,
  hoveredParamTarget,
  projectSearch,
  rowId,
  sectionId,
  sectionParamTypeErrors,
  selectedParamIds,
  surfaceId,
}: {
  readonly activeParamDomIsland?:
    | ProjectGpuRetainedParamTargetLike
    | null
    | undefined;
  readonly disabled?: boolean | undefined;
  readonly draggingParamIds: ReadonlySet<string> | null;
  readonly hoveredParamTarget?:
    | ProjectGpuRetainedParamTargetLike
    | null
    | undefined;
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly rowId: string;
  readonly sectionId: string;
  readonly sectionParamTypeErrors: Readonly<
    Record<string, readonly unknown[] | undefined>
  >;
  readonly selectedParamIds: ReadonlySet<string>;
  readonly surfaceId: string;
}): Partial<GpuRetainedContentRowState> {
  return {
    disabled: Boolean(disabled),
    dragging: draggingParamIds?.has(rowId) ?? false,
    error: (sectionParamTypeErrors[rowId]?.length ?? 0) > 0,
    focused: isProjectGpuRetainedParamTargetForRow(activeParamDomIsland, {
      paramInfoId: rowId,
      sectionId,
      surfaceId,
    }),
    hovered: isProjectGpuRetainedParamTargetForRow(hoveredParamTarget, {
      paramInfoId: rowId,
      sectionId,
      surfaceId,
    }),
    searchFocused: isProjectGpuParamSearchFocused({
      projectSearch,
      rowId,
      sectionId,
    }),
    searchMatched: isProjectGpuParamSearchMatched({
      projectSearch,
      rowId,
      sectionId,
    }),
    selected: selectedParamIds.has(rowId),
  };
}

function isProjectGpuParamSearchFocused({
  projectSearch,
  rowId,
  sectionId,
}: {
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly rowId: string;
  readonly sectionId: string;
}): boolean {
  const focused = projectSearch?.focused;
  return Boolean(
    focused && focused.sectionId === sectionId && focused.paramInfoId === rowId,
  );
}

function isProjectGpuParamSearchMatched({
  projectSearch,
  rowId,
  sectionId,
}: {
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly rowId: string;
  readonly sectionId: string;
}): boolean {
  return (
    projectSearch?.lookup.has(createProjectSearchLookupKey(sectionId, rowId)) ??
    false
  );
}

function isProjectGpuRetainedParamTargetForRow(
  target: ProjectGpuRetainedParamTargetLike | null | undefined,
  row: ProjectGpuRetainedParamTargetLike,
): boolean {
  return Boolean(
    target &&
      target.paramInfoId === row.paramInfoId &&
      target.sectionId === row.sectionId &&
      target.surfaceId === row.surfaceId,
  );
}

function getProjectGpuParamControlKind({
  isParent,
  rendererFamily,
}: {
  readonly isParent: boolean;
  readonly rendererFamily: SectionParamUIRendererFamily | null;
}): string | null {
  if (isParent) {
    return "nested";
  }
  return rendererFamily;
}
