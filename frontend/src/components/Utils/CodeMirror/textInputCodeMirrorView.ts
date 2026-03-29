import type { CodeLanguage } from "utils/codeLanguage";

export type TextInputCodeMirrorMouseDownPlan = {
  shouldActivate: boolean;
  shouldApplyActiveSectionChange: boolean;
};

type BuildTextInputCodeMirrorCoreViewArgs = {
  sectionId: string;
  paramInfoId: string | null;
  isKeyName: boolean;
  isDeploymentMode: boolean;
  autocomplete: boolean;
  language?: CodeLanguage | null;
  tooltipParentDivId?: string | null;
};

export type TextInputCodeMirrorCoreView = {
  divId: string;
  shouldAutocomplete: boolean;
  resolvedTooltipParentDivId: string | null;
};

export type TextInputCodeMirrorInitialActivationEvent = "tab" | null;

export function planTextInputCodeMirrorMouseDown({
  button,
  isDisabled,
}: {
  button: number;
  isDisabled: boolean;
}): TextInputCodeMirrorMouseDownPlan {
  const shouldActivate = !isDisabled && button === 0;

  return {
    shouldActivate,
    shouldApplyActiveSectionChange: shouldActivate,
  };
}

export function shouldActivateTextInputCodeMirrorFromFocus({
  hasActivationEvent,
  isDisabled,
}: {
  hasActivationEvent: boolean;
  isDisabled: boolean;
}): boolean {
  return !isDisabled && !hasActivationEvent;
}

export function shouldAutoActivateTextInputCodeMirrorOnMount({
  hasActivationEvent,
  hasAutoActivatedOnMount,
  isDisabled,
  shouldAutoActivateOnMount,
}: {
  hasActivationEvent: boolean;
  hasAutoActivatedOnMount: boolean;
  isDisabled: boolean;
  shouldAutoActivateOnMount: boolean;
}): boolean {
  return (
    shouldAutoActivateOnMount &&
    !isDisabled &&
    !hasActivationEvent &&
    !hasAutoActivatedOnMount
  );
}

export function getInitialTextInputCodeMirrorActivationEvent({
  isDisabled,
  shouldAutoActivateOnMount,
}: {
  isDisabled: boolean;
  shouldAutoActivateOnMount: boolean;
}): TextInputCodeMirrorInitialActivationEvent {
  return shouldAutoActivateTextInputCodeMirrorOnMount({
    hasActivationEvent: false,
    hasAutoActivatedOnMount: false,
    isDisabled,
    shouldAutoActivateOnMount,
  })
    ? "tab"
    : null;
}

export function shouldRenderTextInputCodeMirrorDummy({
  hasActivationEvent,
  isRealEditorInitialized,
  shouldAutoActivateOnMount,
}: {
  hasActivationEvent: boolean;
  isRealEditorInitialized: boolean;
  shouldAutoActivateOnMount: boolean;
}): boolean {
  if (isRealEditorInitialized) {
    return false;
  }

  return !(shouldAutoActivateOnMount && hasActivationEvent);
}

export function buildTextInputCodeMirrorCoreView({
  sectionId,
  paramInfoId,
  isKeyName,
  isDeploymentMode,
  autocomplete,
  language,
  tooltipParentDivId,
}: BuildTextInputCodeMirrorCoreViewArgs): TextInputCodeMirrorCoreView {
  return {
    divId: `CodeMirror-${sectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`,
    shouldAutocomplete:
      !isDeploymentMode && autocomplete && language === "python",
    resolvedTooltipParentDivId: resolveTooltipParentDivId(tooltipParentDivId),
  };
}

function resolveTooltipParentDivId(
  tooltipParentDivId: string | null | undefined,
): string | null {
  if (tooltipParentDivId === undefined) {
    return null;
  }
  return tooltipParentDivId;
}
