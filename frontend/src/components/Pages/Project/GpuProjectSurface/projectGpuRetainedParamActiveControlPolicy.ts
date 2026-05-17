import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";

type ProjectGpuRetainedParamControlRow = Pick<
  GpuRetainedContentRow,
  "control" | "controlKind" | "state"
>;

export function isProjectGpuRetainedParamControlDomIslandActive({
  row,
}: {
  readonly row: ProjectGpuRetainedParamControlRow;
}): boolean {
  if (
    !isProjectGpuRetainedParamControlBrowserActivationTarget({
      row,
    })
  ) {
    return false;
  }
  if (isProjectGpuRetainedParamTextLikeDomOwned(row)) {
    return false;
  }
  return true;
}

export function isProjectGpuRetainedParamControlBrowserActivationTarget({
  row,
}: {
  readonly row: ProjectGpuRetainedParamControlRow;
}): boolean {
  if (isProjectGpuRetainedParamControlInactive(row)) {
    return false;
  }
  if (isProjectGpuRetainedParamControlCanvasOwned(row)) {
    return false;
  }
  if (!row.control || row.control.kind !== "date-time") {
    return true;
  }
  return row.control.mode !== "time-display";
}

function isProjectGpuRetainedParamControlInactive(
  row: ProjectGpuRetainedParamControlRow,
): boolean {
  return row.state.disabled || !row.controlKind || row.controlKind === "nested";
}

function isProjectGpuRetainedParamControlCanvasOwned(
  row: ProjectGpuRetainedParamControlRow,
): boolean {
  return Boolean(row.control && row.control.commitPolicy !== "native-island");
}

function isProjectGpuRetainedParamTextLikeDomOwned(
  row: ProjectGpuRetainedParamControlRow,
): boolean {
  return Boolean(
    row.control?.kind === "text-like" && row.control.renderOwner === "dom-owned",
  );
}
