import {
  formatBytes,
  parseDropzoneValue,
  shouldShowPasswordReveal,
  type DropzoneStoredAttachment,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getSectionParamUIRendererFamily,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import {
  formatGpuRetainedNumericControlValue,
  snapGpuRetainedNumericControlValue,
} from "gpuFlow/retainedContentControls";
import type {
  GpuRetainedContentColorChoice,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDropdownChoice,
  GpuRetainedContentDropzoneAttachment,
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
  DropzoneModeEnum,
  type CodeObjType,
  type ColorPickerParamCodeObjImpl,
  type DropdownParamCodeObjImpl,
  type DropzoneParamCodeObjImpl,
  type PasswordParamCodeObjImpl,
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
  isDeploymentMode,
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
  readonly isDeploymentMode?: boolean | undefined;
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
      isDeploymentMode: isDeploymentMode ?? false,
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
  isDeploymentMode,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string | null;
  readonly isDeploymentMode: boolean;
  readonly isParent: boolean;
}): GpuRetainedContentControlDescriptor | null {
  if (!controlKind || isParent) {
    return null;
  }
  return createProjectGpuLeafParamControlDescriptor({
    codeObjImpl,
    controlKind,
    isDeploymentMode,
  });
}

function createProjectGpuLeafParamControlDescriptor({
  codeObjImpl,
  controlKind,
  isDeploymentMode,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string;
  readonly isDeploymentMode: boolean;
}): GpuRetainedContentControlDescriptor | null {
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
  if (codeObjImpl.type === CodeObjTypeEnum.ColorPickerParam) {
    return createProjectGpuColorPickerControlDescriptor({
      codeObjImpl: codeObjImpl as ColorPickerParamCodeObjImpl,
      controlKind,
    });
  }
  if (codeObjImpl.type === CodeObjTypeEnum.DropdownParam) {
    return createProjectGpuDropdownControlDescriptor({
      codeObjImpl: codeObjImpl as DropdownParamCodeObjImpl,
      controlKind,
    });
  }
  if (codeObjImpl.type === CodeObjTypeEnum.PasswordParam) {
    return createProjectGpuPasswordControlDescriptor({
      codeObjImpl: codeObjImpl as PasswordParamCodeObjImpl,
      controlKind,
      isDeploymentMode,
    });
  }
  if (codeObjImpl.type === CodeObjTypeEnum.DropzoneParam) {
    return createProjectGpuDropzoneControlDescriptor({
      codeObjImpl: codeObjImpl as DropzoneParamCodeObjImpl,
      controlKind,
    });
  }
  return null;
}

function createProjectGpuColorPickerControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: ColorPickerParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor | null {
  const choices = toProjectGpuColorPickerChoices(codeObjImpl);
  if (choices.length === 0) {
    return null;
  }
  const displayValue = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const selectedIndex = choices.findIndex(
    (choice) => choice.color === displayValue,
  );
  return {
    choices,
    defaultDisplayValue: toProjectGpuParamDisplayValue(codeObjImpl.defaultVal),
    displayValue,
    kind: "color-picker",
    rendererFamily: controlKind,
    commitPolicy: "immediate",
    selectedIndex: selectedIndex === -1 ? null : selectedIndex,
  };
}

function toProjectGpuColorPickerChoices(
  codeObjImpl: ColorPickerParamCodeObjImpl,
): readonly GpuRetainedContentColorChoice[] {
  const colorChoices = codeObjImpl.colorChoices ?? [];
  return colorChoices.map((choice, index) => {
    const color = choice.color;
    const description = choice.description;
    if (typeof color !== "string" || color.length === 0) {
      throw new Error(
        `Invalid GPU retained color choice ${index} for ${codeObjImpl.id}: expected a non-empty color string.`,
      );
    }
    if (typeof description !== "string") {
      throw new Error(
        `Invalid GPU retained color choice ${index} for ${codeObjImpl.id}: expected a description string.`,
      );
    }
    return { color, description };
  });
}

function createProjectGpuDropdownControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: DropdownParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor {
  const choices = toProjectGpuDropdownChoices(codeObjImpl);
  const displayValue = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const selectedIndex = choices.findIndex(
    (choice) => choice.value === displayValue,
  );
  return {
    choices,
    defaultDisplayValue: toProjectGpuParamDisplayValue(codeObjImpl.defaultVal),
    displayValue,
    kind: "dropdown",
    rendererFamily: controlKind,
    commitPolicy: "immediate",
    selectedIndex: selectedIndex === -1 ? null : selectedIndex,
  };
}

function toProjectGpuDropdownChoices(
  codeObjImpl: DropdownParamCodeObjImpl,
): readonly GpuRetainedContentDropdownChoice[] {
  if (!Array.isArray(codeObjImpl.choices)) {
    throw new Error(
      `Invalid GPU retained dropdown choices for ${codeObjImpl.id}: expected a choices array.`,
    );
  }
  return codeObjImpl.choices.map((choice, index) => {
    if (typeof choice !== "string") {
      throw new Error(
        `Invalid GPU retained dropdown choice ${index} for ${codeObjImpl.id}: expected a string.`,
      );
    }
    return { label: choice, value: choice };
  });
}

function createProjectGpuPasswordControlDescriptor({
  codeObjImpl,
  controlKind,
  isDeploymentMode,
}: {
  readonly codeObjImpl: PasswordParamCodeObjImpl;
  readonly controlKind: string;
  readonly isDeploymentMode: boolean;
}): GpuRetainedContentControlDescriptor {
  const displayValue = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const hasSecret = codeObjImpl.hasSecret === true;
  return {
    defaultDisplayValue: toProjectGpuParamDisplayValue(codeObjImpl.defaultVal),
    displayValue,
    hasSecret,
    kind: "password",
    placeholder: hasSecret && displayValue === "" ? "Saved" : "",
    rendererFamily: controlKind,
    revealAvailable:
      !isDeploymentMode &&
      shouldShowPasswordReveal({
        hasSecret,
        value: displayValue,
      }),
    commitPolicy: "native-island",
  };
}

function createProjectGpuDropzoneControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: DropzoneParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor {
  const attachmentLimit = resolveProjectGpuDropzoneAttachmentLimit(
    codeObjImpl.maxAttachments,
  );
  const attachments = getProjectGpuDropzoneDisplayAttachments(codeObjImpl);
  const remainingSlots = getProjectGpuDropzoneRemainingSlots({
    attachmentCount: attachments.length,
    attachmentLimit,
    mode: codeObjImpl.mode,
  });
  return {
    attachments,
    canAttachMore: remainingSlots === null || remainingSlots > 0,
    defaultDisplayValue: toProjectGpuParamDisplayValue(codeObjImpl.defaultVal),
    displayValue: toProjectGpuParamDisplayValue(codeObjImpl.value),
    kind: "dropzone",
    label: getProjectGpuDropzoneLabel({
      attachmentCount: attachments.length,
      mode: codeObjImpl.mode,
      placeholder: codeObjImpl.placeholder,
    }),
    maxAttachments: attachmentLimit,
    mode: codeObjImpl.mode,
    placeholder: codeObjImpl.placeholder,
    remainingSlots,
    rendererFamily: controlKind,
    commitPolicy: "native-island",
  };
}

function getProjectGpuDropzoneDisplayAttachments(
  codeObjImpl: DropzoneParamCodeObjImpl,
): readonly GpuRetainedContentDropzoneAttachment[] {
  if (codeObjImpl.mode === DropzoneModeEnum.STATELESS) {
    return [];
  }
  const parsedValue = parseDropzoneValue(codeObjImpl.value);
  if (!parsedValue) {
    return [];
  }
  return parsedValue.attachments.map(toProjectGpuDropzoneAttachment);
}

function toProjectGpuDropzoneAttachment(
  attachment: DropzoneStoredAttachment,
): GpuRetainedContentDropzoneAttachment {
  return {
    kind: attachment.kind,
    name: attachment.name,
    sizeLabel:
      attachment.kind === "file" && typeof attachment.size === "number"
        ? formatBytes(attachment.size)
        : null,
  };
}

function resolveProjectGpuDropzoneAttachmentLimit(
  maxAttachments: number | null | undefined,
): number | null {
  if (maxAttachments === null || maxAttachments === undefined) {
    return null;
  }
  if (!Number.isFinite(maxAttachments)) {
    return null;
  }
  const limit = Math.floor(maxAttachments);
  return limit < 1 ? null : limit;
}

function getProjectGpuDropzoneRemainingSlots({
  attachmentCount,
  attachmentLimit,
  mode,
}: {
  readonly attachmentCount: number;
  readonly attachmentLimit: number | null;
  readonly mode: DropzoneParamCodeObjImpl["mode"];
}): number | null {
  if (attachmentLimit === null) {
    return null;
  }
  if (mode === DropzoneModeEnum.STATELESS) {
    return attachmentLimit;
  }
  return Math.max(0, attachmentLimit - attachmentCount);
}

function getProjectGpuDropzoneLabel({
  attachmentCount,
  mode,
  placeholder,
}: {
  readonly attachmentCount: number;
  readonly mode: DropzoneParamCodeObjImpl["mode"];
  readonly placeholder: string;
}): string {
  if (attachmentCount === 0) {
    return placeholder;
  }
  const suffix = attachmentCount === 1 ? "" : "s";
  if (mode === DropzoneModeEnum.STATELESS) {
    return `Recent drop${suffix}`;
  }
  return `${attachmentCount} attachment${suffix}`;
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
