import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useState } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_text_field_completion } from "utils/generatedEndpoints";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getOnCreateEditor, wrappedCompletionsFn } from "./getOnCreateEditor";

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
  keyComboActions,
  onEscape,
  onTab,
  color,
  language,
  dummyDivId,
  tooltipParentDivId,
  autocomplete = true,
  isKeyName = false,
  isDisabled = false,
  completionsFn,
}) {
  const [activationEvent, setActivationEvent] = useState(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const theme = useCodeMirrorStyle(color);

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
      setActiveSectionIdAndUpdateZIndex(sectionId);
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
          theme={theme}
          placeholder={defaultVal}
          language={language}
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
        />
      )}
    </>
  );
}

function CoreCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  className,
  singleLine,
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
}) {
  const divId = `CodeMirror-${sectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;
  const isShareMode = useShareSession((x) => x.isShareMode);
  const canUseLsp = !isShareMode;
  const shouldAutocomplete = canUseLsp && autocomplete && language === "python";
  const resolvedTooltipParentDivId =
    tooltipParentDivId === undefined
      ? `${sectionId}-CustomResizable`
      : tooltipParentDivId;

  const resolvedCompletionsFn = useCallback(
    shouldAutocomplete
      ? completionsFn ?? getTextFieldCompletionsFn(sectionId, paramInfoId)
      : () => null,
    [sectionId, paramInfoId, shouldAutocomplete, completionsFn],
  );

  const extensions = getExtensions({
    parentDivId: resolvedTooltipParentDivId,
    language,
    completionsFn: resolvedCompletionsFn,
    singleLine,
    tabToAutocomplete: true,
    keyComboActions,
    onTab,
    onEscape,
  });

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
      extensions={extensions}
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
  const fn = async (fullText: string, position: number) => {
    const setToNotWaiting = setTextFieldWaitingForLSP({
      sectionId,
      paramInfoId,
    });

    const projectConfigId = getCurrProjectConfigId();

    const res = await route_text_field_completion({
      projectConfigId,
      sectionId,
      paramInfoId,
      fullText,
      position,
    });

    setToNotWaiting();
    if (res200(res)) {
      return res.data;
    }
    return [];
  };

  return wrappedCompletionsFn(fn);
}
