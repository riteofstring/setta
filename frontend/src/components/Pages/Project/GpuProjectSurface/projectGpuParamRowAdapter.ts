import {
  getSectionParamUIRendererFamily,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import {
  formatGpuRetainedNumericControlValue,
  snapGpuRetainedNumericControlValue,
} from "gpuFlow/retainedContentControls";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowState,
} from "gpuFlow/retainedContentScene";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import type {
  ZustandProjectSearch,
  ZustandProjectState,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  CodeObjTypeEnum,
  type CodeObjType,
  type RotaryParamCodeObjImpl,
  type SliderParamCodeObjImpl,
} from "utils/generatedTypes";

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
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
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
  const controlKind = getProjectGpuParamControlKind({
    isParent: row.isParent,
    rendererFamily: getSectionParamUIRendererFamily(codeObjType),
  });
  return {
    control: createProjectGpuParamControlDescriptor({
      codeObjImpl,
      controlKind,
      isParent: row.isParent,
    }),
    controlKind,
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

function createProjectGpuParamControlDescriptor({
  codeObjImpl,
  controlKind,
  isParent,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string | null;
  readonly isParent: boolean;
}): GpuRetainedContentControlDescriptor | null {
  if (!controlKind || isParent) {
    return null;
  }
  if (codeObjImpl.type === CodeObjTypeEnum.SwitchParam) {
    const displayValue = toProjectGpuParamDisplayValue(codeObjImpl.value);
    return {
      checked: isProjectGpuSwitchValueChecked(displayValue),
      defaultDisplayValue: toProjectGpuParamDisplayValue(
        codeObjImpl.defaultVal,
      ),
      displayValue,
      kind: "switch",
      rendererFamily: controlKind,
      commitPolicy: "immediate",
    };
  }
  if (codeObjImpl.type === CodeObjTypeEnum.SliderParam) {
    return createProjectGpuRangedControlDescriptor({
      codeObjImpl: codeObjImpl as SliderParamCodeObjImpl,
      controlKind,
      kind: "slider",
    });
  }
  if (codeObjImpl.type === CodeObjTypeEnum.RotaryParam) {
    return createProjectGpuRangedControlDescriptor({
      codeObjImpl: codeObjImpl as RotaryParamCodeObjImpl,
      controlKind,
      kind: "rotary",
    });
  }
  return null;
}

function createProjectGpuRangedControlDescriptor({
  codeObjImpl,
  controlKind,
  kind,
}: {
  readonly codeObjImpl: SliderParamCodeObjImpl | RotaryParamCodeObjImpl;
  readonly controlKind: string;
  readonly kind: "slider" | "rotary";
}): GpuRetainedContentControlDescriptor {
  const min = assertProjectGpuFiniteNumber(codeObjImpl.min, `${kind} min`);
  const max = assertProjectGpuFiniteNumber(codeObjImpl.max, `${kind} max`);
  const step = assertProjectGpuFiniteNumber(codeObjImpl.step, `${kind} step`);
  if (max < min) {
    throw new Error(
      `Invalid GPU retained ${kind} config for ${codeObjImpl.id}: max ${max} is less than min ${min}.`,
    );
  }
  const value = toProjectGpuRetainedNumericControlValue({
    max,
    min,
    step,
    value: codeObjImpl.value,
  });
  const defaultValue = toProjectGpuRetainedNumericControlValue({
    max,
    min,
    step,
    value: codeObjImpl.defaultVal,
  });
  return {
    defaultDisplayValue: formatGpuRetainedNumericControlValue({
      step,
      value: defaultValue,
    }),
    displayValue: formatGpuRetainedNumericControlValue({ step, value }),
    kind,
    rendererFamily: controlKind,
    commitPolicy: "preview-commit",
    max,
    min,
    step,
    value,
  };
}

function toProjectGpuParamDisplayValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function toProjectGpuRetainedNumericControlValue({
  max,
  min,
  step,
  value,
}: {
  readonly max: number;
  readonly min: number;
  readonly step: number;
  readonly value: unknown;
}): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return snapGpuRetainedNumericControlValue({
    max,
    min,
    step,
    value: Number.isFinite(parsed) ? parsed : min,
  });
}

function assertProjectGpuFiniteNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Invalid GPU retained ${label}: expected a finite number.`);
}

function isProjectGpuSwitchValueChecked(value: string): boolean {
  return value === "true";
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
