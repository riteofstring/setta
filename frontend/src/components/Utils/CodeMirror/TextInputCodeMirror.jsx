import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useState } from "react";
import { dbTextFieldInitializeCode } from "requests/sections";
import { variableClick } from "state/actions/keyActivations";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/sections/activeSections";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getCompletionsFn, getOnCreateEditor } from "./getOnCreateEditor";
import { useKeywordStylizer } from "./useKeywordStylizer";

export function TextInputCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onBlur,
  dummyCodeClassName,
  realCodeClassName,
  singleLine,
  onEnter,
  onEscape,
  color,
  language,
  sectionIdToBeActive,
  keywordPositions,
  setKeywordPositions,
}) {
  console.log("TextInputCodeMirror", keywordPositions)
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

  function localOnMouseDown(event) {
    // if (!variableClick(event)) {
    if (!variableClick(event) && event.button === 0) {
      dbTextFieldInitializeCode({ sectionId, paramInfoId });
      setActivationEvent(event);
      if (sectionIdToBeActive) {
        setActiveSectionIdAndUpdateZIndex(sectionIdToBeActive);
      }
    }
  }

  // focused via tab key
  function onFocus() {
    if (!activationEvent) {
      dbTextFieldInitializeCode({ sectionId, paramInfoId });
      setActivationEvent("tab");
    }
  }

  return (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          code={value}
          onMouseDown={localOnMouseDown}
          onFocus={onFocus}
          className={dummyCodeClassName}
          theme={theme}
          keywordPositions={keywordPositions}
          placeholder={defaultVal}
          sectionId={sectionId}
          paramInfoId={paramInfoId}
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
          onEnter={onEnter}
          onEscape={onEscape}
          onBlur={localOnBlur}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          theme={theme}
          keywordPositions={keywordPositions}
          language={language}
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
  onEnter,
  onEscape,
  onBlur,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  theme,
  keywordPositions,
  language,
}) {
  const divId = `CodeMirror-${sectionId}-${paramInfoId}`;

  const { keywordStylizer } = useKeywordStylizer({
    keywordPositions,
    sectionId,
    paramInfoId,
  });

  const completionsFn = useCallback(
    getCompletionsFn(sectionId, paramInfoId, setKeywordPositions),
    [sectionId, paramInfoId],
  );

  const extensions = getExtensions({
    sectionId,
    paramInfoId,
    language,
    completionsFn,
    keywordStylizer,
    singleLine,
    tabToAutocomplete: true,
    onEnter,
    onEscape,
  });

  const onCreateEditor = getOnCreateEditor({
    keywordPositions,
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
      }}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      onBlur={onBlur}
      indentWithTab={false}
    />
  );
}
