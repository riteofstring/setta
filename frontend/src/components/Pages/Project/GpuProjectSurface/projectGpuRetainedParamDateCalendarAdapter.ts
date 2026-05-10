import {
  commitParamInputValueChange,
  getParamInputPreviewState,
} from "components/Params/ParamItems/paramValueUpdates";
import type {
  GpuRetainedContentInteractionEvent,
  GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import { useProjectState } from "state/definitions";
import { shiftCalendarMonth } from "utils/calendarGrid";
import { resolveCalendarDateSelectionValue } from "utils/calendarSelection";
import type { ProjectGpuActiveParamCanvasPopup } from "./projectGpuLayoutAdapter";

export function getProjectGpuRetainedDateCalendarPopupTarget(
  event: GpuRetainedContentInteractionEvent,
): ProjectGpuActiveParamCanvasPopup | null {
  if (event.hit.kind !== "control") {
    return null;
  }
  const row = getProjectGpuRetainedDateCalendarHitRow(event);
  if (
    !row?.control ||
    row.control.kind !== "date-time" ||
    row.control.mode !== "date-calendar" ||
    !row.control.calendar
  ) {
    return null;
  }
  return {
    hitRecordId: event.hit.id,
    kind: "date-calendar",
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
    visibleMonth: row.control.calendar.month,
  };
}

export function getProjectGpuRetainedDateCalendarNavigationTarget(
  event: GpuRetainedContentInteractionEvent,
): ProjectGpuActiveParamCanvasPopup | null {
  if (!isProjectGpuRetainedDateCalendarPopupNavigationHit(event)) {
    return null;
  }
  const row = getProjectGpuRetainedDateCalendarHitRow(event);
  if (
    !row?.control ||
    row.control.kind !== "date-time" ||
    row.control.mode !== "date-calendar" ||
    !row.control.calendar
  ) {
    return null;
  }
  return {
    hitRecordId: event.hit.id,
    kind: "date-calendar",
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
    visibleMonth: shiftCalendarMonth(
      row.control.calendar.month,
      event.hit.navigationDirection,
    ),
  };
}

export function commitProjectGpuRetainedDateCalendarPopupCell(
  event: GpuRetainedContentInteractionEvent,
): boolean {
  if (!isProjectGpuRetainedDateCalendarPopupCellHit(event)) {
    return false;
  }
  const row = getProjectGpuRetainedDateCalendarHitRow(event);
  if (
    !row?.control ||
    row.control.kind !== "date-time" ||
    row.control.mode !== "date-calendar" ||
    !row.control.calendar
  ) {
    return false;
  }
  const cell = getProjectGpuRetainedDateCalendarCell(event, row);
  const calendar = row.control.calendar;
  commitProjectGpuRetainedDateCalendarDate({
    isSelected: cell.selected,
    nextIsoDate: cell.isoDate,
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    selectedDates: calendar.selectedDates,
    selectedTimeValue: calendar.selectedTimeValue,
    selectionMode: calendar.selectionMode,
    includeTime: calendar.includeTime,
  });
  return true;
}

export function commitProjectGpuRetainedDateCalendarDate({
  isSelected,
  nextIsoDate,
  paramInfoId,
  sectionId,
  selectedDates,
  selectedTimeValue,
  selectionMode,
  includeTime,
}: {
  readonly includeTime: boolean;
  readonly isSelected: boolean;
  readonly nextIsoDate: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly selectedDates: readonly string[];
  readonly selectedTimeValue: string;
  readonly selectionMode: "multiple" | "single";
}) {
  const projectState = useProjectState.getState();
  const previewState = getParamInputPreviewState(
    projectState,
    sectionId,
    paramInfoId,
  );
  if (!previewState) {
    throw new Error(
      `Missing GPU retained date-calendar param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  commitParamInputValueChange({
    nextValue: resolveCalendarDateSelectionValue({
      cellIsoDate: nextIsoDate,
      isSelected,
      selectedDates: [...selectedDates],
      selectionMode,
      includeTime,
      selectedTimeValue,
    }),
    paramInfoId,
    previousValue: previewState.baseValue,
    previewState,
    sectionId,
  });
}

export function isProjectGpuRetainedDateCalendarPopupCellHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (event.hit.kind !== "popup-date-cell") {
    return false;
  }
  const row = getProjectGpuRetainedDateCalendarHitRow(event);
  return (
    row?.control?.kind === "date-time" &&
    row.control.mode === "date-calendar" &&
    Boolean(row.control.calendar)
  );
}

export function isProjectGpuRetainedDateCalendarPopupNavigationHit(
  event: GpuRetainedContentInteractionHit,
): event is GpuRetainedContentInteractionHit & {
  readonly hit: GpuRetainedContentInteractionHit["hit"] & {
    readonly kind: "popup-date-navigation";
    readonly navigationDirection: -1 | 1;
  };
} {
  if (
    event.hit.kind !== "popup-date-navigation" ||
    (event.hit.navigationDirection !== -1 &&
      event.hit.navigationDirection !== 1)
  ) {
    return false;
  }
  const row = getProjectGpuRetainedDateCalendarHitRow(event);
  return (
    row?.control?.kind === "date-time" &&
    row.control.mode === "date-calendar" &&
    Boolean(row.control.calendar)
  );
}

function getProjectGpuRetainedDateCalendarCell(
  event: GpuRetainedContentInteractionEvent,
  row: GpuRetainedContentRow,
) {
  const cellIsoDate = event.hit.cellIsoDate;
  const cell =
    typeof cellIsoDate === "string" &&
    row.control?.kind === "date-time" &&
    row.control.calendar
      ? row.control.calendar.cells.find(
          (candidate) => candidate.isoDate === cellIsoDate,
        )
      : undefined;
  if (!cell) {
    throw new Error(
      `Missing GPU retained date cell ${String(cellIsoDate)} for ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  return cell;
}

function getProjectGpuRetainedDateCalendarHitRow(
  event: GpuRetainedContentInteractionHit,
): GpuRetainedContentRow | undefined {
  return event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
}
