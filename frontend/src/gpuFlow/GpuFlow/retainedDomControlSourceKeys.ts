import type {
  GpuRetainedDomControlSourceDescriptor,
  GpuRetainedDomControlTextCoverageState,
} from "../retainedDomControlScene";

export function createGpuRetainedDomControlSourceKey(
  source: Omit<GpuRetainedDomControlSourceDescriptor, "sourceKey">,
): string {
  return JSON.stringify({
    defaultValue: source.defaultValue,
    disabled: source.disabled,
    error: source.error,
    language: source.language,
    linePolicy: source.linePolicy,
    rowId: source.rowId,
    sourceHeight: source.sourceRectCssPx.height,
    sourceWidth: source.sourceRectCssPx.width,
    surfaceId: source.surfaceId,
    textCoverageRevision: source.textCoverageRevision,
    value: source.value,
    valueStyleKey: source.valueStyleKey,
    wrapLines: source.wrapLines,
  });
}

export function withGpuRetainedDomControlTextCoverageState(
  control: GpuRetainedDomControlSourceDescriptor,
  textCoverageState: GpuRetainedDomControlTextCoverageState,
): GpuRetainedDomControlSourceDescriptor {
  const textCoverageRevision =
    createGpuRetainedDomControlTextCoverageRevision(textCoverageState);
  if (
    control.textCoverageRevision === textCoverageRevision &&
    control.textCoverageState.caret === textCoverageState.caret &&
    control.textCoverageState.composition === textCoverageState.composition &&
    control.textCoverageState.selection === textCoverageState.selection
  ) {
    return control;
  }
  const nextControl = {
    ...control,
    textCoverageRevision,
    textCoverageState,
  } satisfies Omit<GpuRetainedDomControlSourceDescriptor, "sourceKey"> &
    Pick<GpuRetainedDomControlSourceDescriptor, "sourceKey">;
  return {
    ...nextControl,
    sourceKey: createGpuRetainedDomControlSourceKey(nextControl),
  };
}

export function createGpuRetainedDomControlTextCoverageState(
  active: boolean,
): GpuRetainedDomControlTextCoverageState {
  return active
    ? {
        caret: "visible",
        composition: "inactive",
        selection: "collapsed",
      }
    : {
        caret: "hidden",
        composition: "inactive",
        selection: "none",
      };
}

export function createGpuRetainedDomControlTextCoverageRevision(
  textCoverageState: GpuRetainedDomControlTextCoverageState,
): string {
  return JSON.stringify(textCoverageState);
}
