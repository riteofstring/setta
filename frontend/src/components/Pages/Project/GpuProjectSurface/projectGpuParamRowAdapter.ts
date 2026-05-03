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
  GpuRetainedContentDateCalendarDescriptor,
  GpuRetainedContentDateCalendarMonth,
} from "gpuFlow/retainedContentDateCalendarTypes";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDropdownChoice,
  GpuRetainedContentDropzoneAttachment,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowState,
  GpuRetainedContentRowStatus,
} from "gpuFlow/retainedContentScene";
import type { ParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import type {
  ZustandProjectSearch,
  ZustandProjectState,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  buildCalendarMonthGrid,
  resolveCalendarAnchorDate,
} from "utils/calendarGrid";
import {
  parseCalendarSelectedDates,
  resolveCalendarSummaryText,
} from "utils/calendarSelection";
import {
  CodeObjTypeEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  TextParamUIConfig,
  TimeControlModeEnum,
  TimeDisplayFormatEnum,
  type ButtonParamCodeObjImpl,
  type CodeObjType,
  type ColorPickerParamCodeObjImpl,
  type DateParamCodeObjImpl,
  type DateSelectionMode,
  type DropdownParamCodeObjImpl,
  type DropzoneParamCodeObjImpl,
  type PasswordParamCodeObjImpl,
  type RotaryParamCodeObjImpl,
  type SliderParamCodeObjImpl,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";
import {
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getLocalTodayIsoDate,
  splitIsoDateAndTimeParts,
} from "utils/textParamDateTime";
import { createProjectGpuButtonControlDescriptor } from "./projectGpuParamButtonRowDescriptor";
import { createProjectGpuColorPickerControlDescriptor } from "./projectGpuParamColorPickerRowDescriptor";
import { createProjectGpuParamRowStatus } from "./projectGpuParamRowStatus";
import { getProjectGpuParamRowStatusMessages } from "./projectGpuParamRowStatusMessages";
import { createProjectGpuTextLikeControlDescriptorIfSupported } from "./projectGpuParamTextLikeRowDescriptor";
import {
  getProjectGpuDateCalendarVisibleMonth,
  validateProjectGpuDateCalendarVisibleMonth,
  type ProjectGpuRetainedParamCanvasPopupLike,
} from "./projectGpuRetainedParamDateCalendarMonth";

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
  activeParamCanvasControl,
  activeParamCanvasPopup,
  activeParamDomIsland,
  codeObjImpl,
  disabled,
  draggingParamIds,
  edgeInputParamIds,
  hoveredParamTarget,
  isDeploymentMode,
  paramDuplicateIndex,
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
  readonly paramDuplicateIndex: ParamDuplicateIndex;
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
  return {
    control: createProjectGpuParamControlDescriptor({
      codeObjImpl,
      controlKind,
      dateCalendarVisibleMonth,
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

function createProjectGpuParamControlDescriptor({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
  isParent,
  isDeploymentMode,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string | null;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
  readonly isDeploymentMode: boolean;
  readonly isParent: boolean;
}): GpuRetainedContentControlDescriptor | null {
  if (!controlKind || isParent) {
    return null;
  }
  return createProjectGpuLeafParamControlDescriptor({
    codeObjImpl,
    controlKind,
    dateCalendarVisibleMonth,
    isDeploymentMode,
  });
}

function createProjectGpuLeafParamControlDescriptor({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
  isDeploymentMode,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
  readonly isDeploymentMode: boolean;
}): GpuRetainedContentControlDescriptor | null {
  return (
    createProjectGpuTextLikeControlDescriptorIfSupported({
      codeObjImpl,
      controlKind,
    }) ??
    createProjectGpuSpecializedControlDescriptorIfSupported({
      codeObjImpl,
      controlKind,
      isDeploymentMode,
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

function createProjectGpuDateTimeControlDescriptorIfSupported({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
}): GpuRetainedContentControlDescriptor | null {
  if (
    codeObjImpl.type !== CodeObjTypeEnum.DateParam &&
    codeObjImpl.type !== CodeObjTypeEnum.TimeParam
  ) {
    return null;
  }
  return createProjectGpuDateTimeControlDescriptor({
    codeObjImpl: codeObjImpl as DateParamCodeObjImpl | TimeParamCodeObjImpl,
    controlKind,
    dateCalendarVisibleMonth,
  });
}

function createProjectGpuDateTimeControlDescriptor({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
}: {
  readonly codeObjImpl: DateParamCodeObjImpl | TimeParamCodeObjImpl;
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
}): GpuRetainedContentControlDescriptor {
  if (codeObjImpl.type === CodeObjTypeEnum.DateParam) {
    return createProjectGpuDateControlDescriptor({
      codeObjImpl,
      controlKind,
      dateCalendarVisibleMonth,
    });
  }
  return createProjectGpuTimeControlDescriptor({
    codeObjImpl,
    controlKind,
  });
}

function createProjectGpuDateControlDescriptor({
  codeObjImpl,
  controlKind,
  dateCalendarVisibleMonth,
}: {
  readonly codeObjImpl: DateParamCodeObjImpl;
  readonly controlKind: string;
  readonly dateCalendarVisibleMonth: GpuRetainedContentDateCalendarMonth | null;
}): GpuRetainedContentControlDescriptor {
  const displayValue = getProjectGpuDateControlDisplayValue(codeObjImpl);
  const mode = getProjectGpuDateControlMode(codeObjImpl);
  return {
    calendar:
      mode === "date-calendar"
        ? createProjectGpuDateCalendarDescriptor(
            codeObjImpl,
            dateCalendarVisibleMonth,
          )
        : null,
    defaultDisplayValue: getProjectGpuDateControlDisplayValue({
      ...codeObjImpl,
      value: codeObjImpl.defaultVal,
    }),
    displayValue,
    kind: "date-time",
    label: getProjectGpuDateControlLabel(codeObjImpl),
    mode,
    rendererFamily: controlKind,
    summaryText: getProjectGpuDateControlSummaryText(codeObjImpl),
    commitPolicy: mode === "date-calendar" ? "immediate" : "native-island",
  };
}

function createProjectGpuTimeControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: TimeParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor {
  return {
    calendar: null,
    defaultDisplayValue: getProjectGpuTimeControlDisplayValue({
      ...codeObjImpl,
      value: codeObjImpl.defaultVal,
    }),
    displayValue: getProjectGpuTimeControlDisplayValue(codeObjImpl),
    kind: "date-time",
    label:
      codeObjImpl.timeControlMode === TimeControlModeEnum.display
        ? "Display time"
        : "Time input",
    mode:
      codeObjImpl.timeControlMode === TimeControlModeEnum.display
        ? "time-display"
        : "time-input",
    rendererFamily: controlKind,
    summaryText: null,
    commitPolicy: "native-island",
  };
}

function getProjectGpuDateControlDisplayValue(
  codeObjImpl: DateParamCodeObjImpl,
): string {
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  if (codeObjImpl.dateIncludesTime) {
    return formatDateTimeForDisplay({
      raw: value,
      dateDisplayFormat: codeObjImpl.dateDisplayFormat,
      timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
    });
  }
  return formatDateForDisplay(value, codeObjImpl.dateDisplayFormat);
}

function getProjectGpuTimeControlDisplayValue(
  codeObjImpl: TimeParamCodeObjImpl,
): string {
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const formatted = formatTimeForDisplay(value, codeObjImpl.timeDisplayFormat);
  return formatted.trim().length > 0 ? formatted : "--:--";
}

function getProjectGpuDateControlMode(
  codeObjImpl: DateParamCodeObjImpl,
): "date-calendar" | "date-input" | "date-time-input" {
  if (codeObjImpl.dateControlMode === DateControlModeEnum.calendar) {
    return "date-calendar";
  }
  return codeObjImpl.dateIncludesTime ? "date-time-input" : "date-input";
}

function getProjectGpuDateControlLabel(
  codeObjImpl: DateParamCodeObjImpl,
): string {
  if (codeObjImpl.dateControlMode === DateControlModeEnum.calendar) {
    return codeObjImpl.dateIncludesTime ? "Calendar + time" : "Calendar";
  }
  return codeObjImpl.dateIncludesTime ? "Date + time input" : "Date input";
}

function getProjectGpuDateControlSummaryText(
  codeObjImpl: DateParamCodeObjImpl,
): string | null {
  if (codeObjImpl.dateControlMode !== DateControlModeEnum.calendar) {
    return null;
  }
  const selectionMode = codeObjImpl.dateIncludesTime
    ? DateSelectionModeEnum.single
    : codeObjImpl.dateSelectionMode;
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const selectedDates = parseCalendarSelectedDates(
    value,
    selectionMode,
    codeObjImpl.dateIncludesTime,
  );
  return resolveCalendarSummaryText({
    selectedDates,
    value,
    selectionMode,
    includeTime: codeObjImpl.dateIncludesTime,
    splitDateTime: splitIsoDateAndTimeParts(value),
    dateDisplayFormat: codeObjImpl.dateDisplayFormat,
    timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
  });
}

function createProjectGpuDateCalendarDescriptor(
  codeObjImpl: DateParamCodeObjImpl,
  visibleMonth: GpuRetainedContentDateCalendarMonth | null,
): GpuRetainedContentDateCalendarDescriptor {
  const value = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const selectionMode = getProjectGpuDateCalendarSelectionMode(codeObjImpl);
  const splitDateTime = splitIsoDateAndTimeParts(value);
  const selectedDates = parseCalendarSelectedDates(
    value,
    selectionMode,
    codeObjImpl.dateIncludesTime,
  );
  const anchor =
    visibleMonth ?? resolveCalendarAnchorDate(selectedDates[0] ?? "");
  validateProjectGpuDateCalendarVisibleMonth(anchor);
  const selectedDateSet = new Set(selectedDates);
  const todayIso = getLocalTodayIsoDate();
  const summaryText = resolveCalendarSummaryText({
    selectedDates,
    value,
    selectionMode,
    includeTime: codeObjImpl.dateIncludesTime,
    splitDateTime,
    dateDisplayFormat: codeObjImpl.dateDisplayFormat,
    timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
  });
  return {
    cells: buildCalendarMonthGrid({
      year: anchor.year,
      monthIndex: anchor.monthIndex,
      weekStartsOn: codeObjImpl.dateCalendarWeekStart,
    }).map((cell) => ({
      dayOfMonth: cell.dayOfMonth,
      inCurrentMonth: cell.inCurrentMonth,
      isoDate: cell.isoDate,
      selected: selectedDateSet.has(cell.isoDate),
      today: cell.isoDate === todayIso,
    })),
    includeTime: codeObjImpl.dateIncludesTime,
    month: {
      monthIndex: anchor.monthIndex,
      year: anchor.year,
    },
    monthTitle: formatProjectGpuDateCalendarMonthTitle(
      anchor.year,
      anchor.monthIndex,
    ),
    selectedDates,
    selectedTimeValue: splitDateTime?.time24 ?? "00:00",
    selectionMode,
    summaryText,
    weekdayLabels: getProjectGpuDateCalendarWeekdayLabels(
      codeObjImpl.dateCalendarWeekStart,
    ),
  };
}

function getProjectGpuDateCalendarSelectionMode(
  codeObjImpl: DateParamCodeObjImpl,
): DateSelectionMode {
  return codeObjImpl.dateIncludesTime
    ? DateSelectionModeEnum.single
    : codeObjImpl.dateSelectionMode;
}

function getProjectGpuDateCalendarWeekdayLabels(
  weekStart: DateParamCodeObjImpl["dateCalendarWeekStart"],
): readonly string[] {
  const labels = TextParamUIConfig.calendarWeekdayLabelsByWeekStart[weekStart];
  if (!labels) {
    throw new Error(`Missing GPU retained weekday labels for ${weekStart}.`);
  }
  return labels;
}

function formatProjectGpuDateCalendarMonthTitle(
  year: number,
  monthIndex: number,
): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
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
  readonly selectedParamIds: ReadonlySet<string>;
  readonly surfaceId: string;
  readonly status: GpuRetainedContentRowStatus | null;
}): Partial<GpuRetainedContentRowState> {
  return {
    disabled: Boolean(disabled),
    dragging: draggingParamIds?.has(rowId) ?? false,
    error: status !== null,
    focused:
      isProjectGpuRetainedParamTargetForRow(activeParamDomIsland, {
        paramInfoId: rowId,
        sectionId,
        surfaceId,
      }) ||
      isProjectGpuRetainedParamTargetForRow(activeParamCanvasControl, {
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
