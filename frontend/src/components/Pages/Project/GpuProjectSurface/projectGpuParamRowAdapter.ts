import {
  formatBytes,
  parseDropzoneValue,
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
import type { GpuRetainedContentDateCalendarMonth } from "gpuFlow/retainedContentDateCalendarTypes";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDropdownChoice,
  GpuRetainedContentDropzoneAttachment,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowState,
  GpuRetainedContentRowStatus,
} from "gpuFlow/retainedContentScene";
import type { ParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import type {
  ZustandProjectSearch,
  ZustandProjectState,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  CodeObjTypeEnum,
  DropzoneModeEnum,
  type ButtonParamCodeObjImpl,
  type CodeObjType,
  type ColorPickerParamCodeObjImpl,
  type DropdownParamCodeObjImpl,
  type DropzoneParamCodeObjImpl,
  type PasswordParamCodeObjImpl,
  type RotaryParamCodeObjImpl,
  type SliderParamCodeObjImpl,
} from "utils/generatedTypes";
import { createProjectGpuButtonControlDescriptor } from "./projectGpuParamButtonRowDescriptor";
import { createProjectGpuColorPickerControlDescriptor } from "./projectGpuParamColorPickerRowDescriptor";
import { createProjectGpuDateTimeControlDescriptorIfSupported } from "./projectGpuParamDateTimeRowDescriptor";
import { toProjectGpuParamDisplayValue } from "./projectGpuParamDisplayValue";
import { createProjectGpuPasswordControlDescriptor } from "./projectGpuParamPasswordRowDescriptor";
import { getProjectGpuParamTextLikePolicyRowHeight } from "./projectGpuParamRowHeight";
import { resolveProjectGpuParamRowLabel } from "./projectGpuParamRowLabel";
import { createProjectGpuParamRowStatus } from "./projectGpuParamRowStatus";
import { getProjectGpuParamRowStatusMessages } from "./projectGpuParamRowStatusMessages";
import { createProjectGpuTextLikeControlDescriptorIfSupported } from "./projectGpuParamTextLikeRowDescriptor";
import {
  getProjectGpuDateCalendarVisibleMonth,
  type ProjectGpuRetainedParamCanvasPopupLike,
} from "./projectGpuRetainedParamDateCalendarMonth";
import type { ProjectGpuRetainedPasswordRevealStateMap } from "./projectGpuRetainedParamPasswordRevealState";

export type ProjectGpuRetainedParamSearchState = Pick<
  ZustandProjectSearch,
  "focused" | "lookup"
>;

type ProjectGpuRetainedParamTargetLike = {
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly surfaceId: string;
};

type ProjectGpuRetainedParamDomIslandTargetLike =
  ProjectGpuRetainedParamTargetLike & {
    readonly hitRecordId: string;
  };

type ProjectGpuParamTreeRowLike = {
  readonly depth: number;
  readonly id: string;
  readonly isParent: boolean;
};

export function createProjectGpuParamRowInput({
  activeParamCanvasControl,
  activeParamCanvasPopup,
  activeParamDomIsland,
  codeObjImpl,
  configLanguage,
  disabled,
  draggingParamIds,
  edgeInputParamIds,
  hoveredParamTarget,
  isDeploymentMode,
  paramDuplicateIndex,
  passwordRevealStates,
  projectSearch,
  projectState,
  row,
  sectionId,
  sectionParamTypeErrors,
  selectedParamIds,
  surfaceId,
}: {
  readonly activeParamCanvasControl?:
    | ProjectGpuRetainedParamTargetLike
    | null
    | undefined;
  readonly activeParamCanvasPopup?:
    | ProjectGpuRetainedParamCanvasPopupLike
    | null
    | undefined;
  readonly activeParamDomIsland?:
    | ProjectGpuRetainedParamDomIslandTargetLike
    | null
    | undefined;
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly configLanguage: string;
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
  readonly paramDuplicateIndex: ParamDuplicateIndex;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly row: ProjectGpuParamTreeRowLike;
  readonly sectionId: string;
  readonly sectionParamTypeErrors: Readonly<
    Record<string, readonly string[] | undefined>
  >;
  readonly selectedParamIds: ReadonlySet<string>;
  readonly surfaceId: string;
}): GpuRetainedContentRowInput {
  const codeObjType = codeObjImpl.type as CodeObjType;
  const controlKind = getProjectGpuParamControlKind({
    isParent: row.isParent,
    rendererFamily: getSectionParamUIRendererFamily(codeObjType),
  });
  const dateCalendarVisibleMonth = getProjectGpuDateCalendarVisibleMonth({
    activeParamCanvasPopup,
    rowId: row.id,
    sectionId,
    surfaceId,
  });
  const status = createProjectGpuParamRowStatus(
    getProjectGpuParamRowStatusMessages({
      paramDuplicateIndex,
      projectState,
      rowId: row.id,
      sectionParamTypeErrors,
    }),
  );
  const control = createProjectGpuParamControlDescriptor({
    codeObjImpl,
    configLanguage,
    controlKind,
    dateCalendarVisibleMonth,
    isParent: row.isParent,
    isDeploymentMode: isDeploymentMode ?? false,
    passwordRevealStates,
    rowId: row.id,
    sectionId,
  });
  return {
    control,
    controlKind,
    depth: row.depth,
    ...getProjectGpuParamRowHeightInput(control),
    id: row.id,
    ...resolveProjectGpuParamRowLabel({
      codeObjImpl,
      projectState,
      rowId: row.id,
      sectionId,
    }),
    ports: edgeInputParamIds.has(row.id)
      ? [{ id: row.id, kind: "input", side: "left" }]
      : [],
    state: createProjectGpuParamRowState({
      activeParamCanvasControl,
      activeParamDomIsland,
      disabled,
      draggingParamIds,
      hoveredParamTarget,
      projectSearch,
      rowId: row.id,
      sectionId,
      selectedParamIds,
      surfaceId,
      status,
    }),
    status,
  };
}

function getProjectGpuParamRowHeightInput(
  control: GpuRetainedContentControlDescriptor | null,
): Pick<GpuRetainedContentRowInput, "height"> | Record<string, never> {
  if (control?.kind !== "text-like") {
    return {};
  }
  const height = getProjectGpuParamTextLikePolicyRowHeight(control.policy);
  return height === null ? {} : { height };
}

function createProjectGpuParamControlDescriptor({
  codeObjImpl,
  configLanguage,
  controlKind,
  dateCalendarVisibleMonth,
  isParent,
  isDeploymentMode,
  passwordRevealStates,
  rowId,
  sectionId,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly configLanguage: string;
  readonly controlKind: string | null;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
  readonly isDeploymentMode: boolean;
  readonly isParent: boolean;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly rowId: string;
  readonly sectionId: string;
}): GpuRetainedContentControlDescriptor | null {
  if (!controlKind || isParent) {
    return null;
  }
  return createProjectGpuLeafParamControlDescriptor({
    codeObjImpl,
    configLanguage,
    controlKind,
    dateCalendarVisibleMonth,
    isDeploymentMode,
    passwordRevealStates,
    rowId,
    sectionId,
  });
}

function createProjectGpuLeafParamControlDescriptor({
  codeObjImpl,
  configLanguage,
  controlKind,
  dateCalendarVisibleMonth,
  isDeploymentMode,
  passwordRevealStates,
  rowId,
  sectionId,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly configLanguage: string;
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
  readonly isDeploymentMode: boolean;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly rowId: string;
  readonly sectionId: string;
}): GpuRetainedContentControlDescriptor | null {
  return (
    createProjectGpuTextLikeControlDescriptorIfSupported({
      codeObjImpl,
      configLanguage,
      controlKind,
    }) ??
    createProjectGpuSpecializedControlDescriptorIfSupported({
      codeObjImpl,
      controlKind,
      isDeploymentMode,
      passwordRevealStates,
      rowId,
      sectionId,
    }) ??
    createProjectGpuDateTimeControlDescriptorIfSupported({
      codeObjImpl,
      controlKind,
      dateCalendarVisibleMonth,
    })
  );
}

function createProjectGpuSpecializedControlDescriptorIfSupported({
  codeObjImpl,
  controlKind,
  isDeploymentMode,
  passwordRevealStates,
  rowId,
  sectionId,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string;
  readonly isDeploymentMode: boolean;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly rowId: string;
  readonly sectionId: string;
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
  if (codeObjImpl.type === CodeObjTypeEnum.ButtonParam) {
    return createProjectGpuButtonControlDescriptor({
      codeObjImpl: codeObjImpl as ButtonParamCodeObjImpl,
      controlKind,
    });
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
      passwordRevealStates,
      rowId,
      sectionId,
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
    id: attachment.id ?? null,
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
  activeParamCanvasControl,
  activeParamDomIsland,
  disabled,
  draggingParamIds,
  hoveredParamTarget,
  projectSearch,
  rowId,
  sectionId,
  selectedParamIds,
  surfaceId,
  status,
}: {
  readonly activeParamCanvasControl?:
    | ProjectGpuRetainedParamTargetLike
    | null
    | undefined;
  readonly activeParamDomIsland?:
    | ProjectGpuRetainedParamDomIslandTargetLike
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
  readonly selectedParamIds: ReadonlySet<string>;
  readonly surfaceId: string;
  readonly status: GpuRetainedContentRowStatus | null;
}): Partial<GpuRetainedContentRowState> {
  const rowTarget = {
    paramInfoId: rowId,
    sectionId,
    surfaceId,
  };
  return {
    controlFocused: isProjectGpuRetainedParamTargetForRow(
      activeParamCanvasControl,
      rowTarget,
    ),
    disabled: Boolean(disabled),
    dragging: draggingParamIds?.has(rowId) ?? false,
    error: status !== null,
    focused: false,
    hovered: isProjectGpuRetainedParamTargetForRow(
      hoveredParamTarget,
      rowTarget,
    ),
    ...getProjectGpuParamNativeRowState(activeParamDomIsland, rowTarget),
    ...getProjectGpuParamSearchState({ projectSearch, rowId, sectionId }),
    selected: selectedParamIds.has(rowId),
  };
}

function getProjectGpuParamNativeRowState(
  target: ProjectGpuRetainedParamDomIslandTargetLike | null | undefined,
  row: ProjectGpuRetainedParamTargetLike,
) {
  if (!target || !isProjectGpuRetainedParamTargetForRow(target, row)) {
    return { nativeControlActive: false, nativeLabelActive: false };
  }
  return {
    nativeControlActive: target.hitRecordId.startsWith("control:"),
    nativeLabelActive: target.hitRecordId.startsWith("label:"),
  };
}

function getProjectGpuParamSearchState({
  projectSearch,
  rowId,
  sectionId,
}: {
  readonly projectSearch?: ProjectGpuRetainedParamSearchState | undefined;
  readonly rowId: string;
  readonly sectionId: string;
}) {
  const focused = projectSearch?.focused;
  return {
    searchFocused: Boolean(
      focused &&
        focused.sectionId === sectionId &&
        focused.paramInfoId === rowId,
    ),
    searchMatched:
      projectSearch?.lookup.has(
        createProjectSearchLookupKey(sectionId, rowId),
      ) ?? false,
  };
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
