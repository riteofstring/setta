export function resolveParamUIDisabled({
  isSelectingParams,
  disabledOrFrozen,
  canEditParams,
  isDeploymentMode,
  isCodeParam,
}: {
  isSelectingParams: boolean;
  disabledOrFrozen: boolean;
  canEditParams: boolean;
  isDeploymentMode: boolean;
  isCodeParam: boolean;
}): boolean {
  return (
    isSelectingParams ||
    disabledOrFrozen ||
    !canEditParams ||
    (isDeploymentMode && isCodeParam)
  );
}
