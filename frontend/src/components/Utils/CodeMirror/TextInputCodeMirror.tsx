import type { Completion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { textFieldCompletion } from "openapi/http";
import { useCallback, useState } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getOnCreateEditor, wrappedCompletionsFn } from "./getOnCreateEditor";
import { useCodeMirrorTooltipParent } from "./useCodeMirrorTooltipParent";
export function TextInputCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onBlur,
  onMouseDown,
  dummyCodeClassName,
  realCodeClassName,
  singleLine,
  wrapLines,
  keyComboActions,
  onEscape,
  onTab,
  color,
  language,
  dummyDivId,
  tooltipParentDivId,
  autocomplete = true,
  focusActiveSectionOnMouseDown = true,
  isKeyName = false,
  isDisabled = false,
  completionsFn,
}) {
  const [activationEvent, setActivationEvent] = useState<
    "tab" | { readonly clientX: number; readonly clientY: number } | null
  >(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const theme = useCodeMirrorStyle(color);
  const gpuFlowControl = getTextInputCodeMirrorGpuFlowControl({
    isKeyName,
    paramInfoId,
    sectionId,
  });
  function localOnBlur() {
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 0);
    onBlur?.();
  }
  // Has to be onMouseDownCapture to avoid section outline flashing
  // when section is locked.
  function localOnMouseDownCapture(event) {
    if (isDisabled) {
      onMouseDown?.(event);
      return;
    }
    if (event.button === 0) {
      setActivationEvent(event);
      if (focusActiveSectionOnMouseDown) {
        applyActiveSectionChange({ interaction: "input-focus", sectionId });
      }
    }
    onMouseDown?.(event);
  }
  // focused via tab key
  function onFocus() {
    if (isDisabled) {
      return;
    }
    if (!activationEvent) {
      setActivationEvent("tab");
    }
  }
  return (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          divId={dummyDivId}
          code={value}
          onMouseDownCapture={localOnMouseDownCapture}
          onFocus={onFocus}
          className={dummyCodeClassName}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          placeholder={defaultVal}
          language={language}
          gpuFlowControl={gpuFlowControl}
        />
      )}
      {activationEvent && (
        <CoreCodeMirror
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          className={realCodeClassName}
          singleLine={singleLine}
          wrapLines={wrapLines}
          keyComboActions={keyComboActions}
          onEscape={onEscape}
          onTab={onTab}
          onBlur={localOnBlur}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          theme={theme}
          language={language}
          autocomplete={autocomplete}
          isKeyName={isKeyName}
          tooltipParentDivId={tooltipParentDivId}
          completionsFn={completionsFn}
          gpuFlowControl={gpuFlowControl}
        />
      )}
    </>
  );
}

function getTextInputCodeMirrorGpuFlowControl({
  isKeyName,
  paramInfoId,
  sectionId,
}: {
  isKeyName: boolean;
  paramInfoId: string | null | undefined;
  sectionId: string;
}) {
  return `codemirror:${sectionId}:${paramInfoId ?? ""}${isKeyName ? ":key" : ":value"}`;
}

function resolveTooltipParentDivId(
  tooltipParentDivId: string | null | undefined,
): string | null {
  if (tooltipParentDivId === undefined) {
    return null;
  }
  return tooltipParentDivId;
}
function CoreCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  className,
  singleLine,
  wrapLines,
  keyComboActions,
  onEscape,
  onBlur,
  onTab,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  theme,
  language,
  autocomplete,
  isKeyName,
  completionsFn,
  tooltipParentDivId,
  gpuFlowControl,
}) {
  const divId = `CodeMirror-${sectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const canUseLsp = !isDeploymentMode;
  const shouldAutocomplete = canUseLsp && autocomplete && language === "python";
  const resolvedTooltipParentDivId =
    resolveTooltipParentDivId(tooltipParentDivId);
  const tooltipParent = useCodeMirrorTooltipParent(resolvedTooltipParentDivId);
  const resolvedCompletionsFn = useCallback(
    shouldAutocomplete
      ? completionsFn ?? getTextFieldCompletionsFn(sectionId, paramInfoId)
      : () => null,
    [sectionId, paramInfoId, shouldAutocomplete, completionsFn],
  );
  const extensions = getExtensions({
    parent: tooltipParent,
    language,
    completionsFn: resolvedCompletionsFn,
    singleLine,
    wrapLines,
    tabToAutocomplete: true,
    keyComboActions,
    onTab,
    onEscape,
  });
  const accessibleName = isKeyName ? "Parameter name" : "Parameter value";
  const onCreateEditor = getOnCreateEditor({
    initialEvent,
    setRealIsInitialized,
    divId,
    value,
    defaultVal,
  });
  return (
    <CodeMirror
      id={divId}
      data-gpu-flow-activation="mousedown"
      data-gpu-flow-control={gpuFlowControl}
      data-gpu-flow-interactive="true"
      className={`${className} ${!realIsInitialized ? "opacity-0" : ""}`}
      value={value}
      placeholder={defaultVal}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        tabSize: 4,
      }}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={[
        ...extensions,
        EditorView.contentAttributes.of({ "aria-label": accessibleName }),
      ]}
      onChange={onChange}
      onBlur={onBlur}
      indentWithTab={false} // I take care of this in getExtensions
      tabIndex={0} // keep focusable for tab navigation
    />
  );
}
function getTextFieldCompletionsFn(
  sectionId: string,
  paramInfoId: string | null,
) {
  const fn = async (
    fullText: string,
    position: number,
  ): Promise<Completion[]> => {
    const setToNotWaiting = setTextFieldWaitingForLSP({
      sectionId,
      paramInfoId,
    });
    const projectConfigId = getCurrProjectConfigId();
    const request = textFieldCompletion({
      body: {
        projectConfigId,
        sectionId,
        paramInfoId,
        fullText,
        position,
      },
    } as Parameters<typeof textFieldCompletion>[0]);
    const res = await callOpenAPI(request as Parameters<typeof callOpenAPI>[0]);
    setToNotWaiting();
    if (res200(res)) {
      return (res.data ?? []) as Completion[];
    }
    return [];
  };
  return wrappedCompletionsFn(fn);
}
