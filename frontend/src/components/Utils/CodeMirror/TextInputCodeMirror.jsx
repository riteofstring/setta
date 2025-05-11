import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useState } from "react";
import { wsTextFieldCompletion } from "requests/sections";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getOnCreateEditor, wrappedCompletionsFn } from "./getOnCreateEditor";

export function TextInputCodeMirror({
  dataSectionId,
  visualSectionId,
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
  autocomplete = true,
  isKeyName = false,
  isDisabled = false,
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
      setActiveSectionIdAndUpdateZIndex(visualSectionId);
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
          dataSectionId={dataSectionId}
          visualSectionId={visualSectionId}
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
        />
      )}
    </>
  );
}

function CoreCodeMirror({
  dataSectionId,
  visualSectionId,
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
}) {
  const divId = `CodeMirror-${visualSectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;

  const completionsFn = useCallback(
    autocomplete
      ? getTextFieldCompletionsFn(dataSectionId, paramInfoId, language)
      : () => null,
    [dataSectionId, paramInfoId, autocomplete, language],
  );

  const extensions = getExtensions({
    parentDivId: `${visualSectionId}-CustomResizable`,
    language,
    completionsFn,
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
      tabIndex="0" // need this for tabbingLogic to work
    />
  );
}

function getTextFieldCompletionsFn(sectionId, paramInfoId, language) {
  const fn = async (fullText, position) => {
    const setToNotWaiting = setTextFieldWaitingForLSP({
      sectionId,
      paramInfoId,
    });

    const res = await wsTextFieldCompletion({
      sectionId,
      paramInfoId,
      fullText,
      position,
    });

    setToNotWaiting();

    return res;
  };

  return wrappedCompletionsFn(fn, language);
}
