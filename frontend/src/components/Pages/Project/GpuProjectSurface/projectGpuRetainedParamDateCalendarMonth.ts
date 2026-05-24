import type { GpuRetainedContentDateCalendarMonth } from "gpuFlow/retainedContentDateCalendarTypes";

export type ProjectGpuRetainedParamCanvasPopupLike = {
  readonly kind: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly surfaceId: string;
  readonly visibleMonth?: GpuRetainedContentDateCalendarMonth | undefined;
};

export function getProjectGpuDateCalendarVisibleMonth({
  activeParamCanvasPopup,
  rowId,
  sectionId,
  surfaceId,
}: {
  readonly activeParamCanvasPopup?:
    | ProjectGpuRetainedParamCanvasPopupLike
    | null
    | undefined;
  readonly rowId: string;
  readonly sectionId: string;
  readonly surfaceId: string;
}): GpuRetainedContentDateCalendarMonth | null {
  if (
    activeParamCanvasPopup?.kind !== "date-calendar" ||
    activeParamCanvasPopup.paramInfoId !== rowId ||
    activeParamCanvasPopup.sectionId !== sectionId ||
    activeParamCanvasPopup.surfaceId !== surfaceId
  ) {
    return null;
  }
  return activeParamCanvasPopup.visibleMonth ?? null;
}

export function validateProjectGpuDateCalendarVisibleMonth(
  month: GpuRetainedContentDateCalendarMonth,
) {
  if (
    !Number.isInteger(month.year) ||
    !Number.isInteger(month.monthIndex) ||
    month.monthIndex < 0 ||
    month.monthIndex > 11
  ) {
    throw new Error(
      `Invalid GPU retained date calendar visible month ${month.year}-${month.monthIndex}.`,
    );
  }
}
