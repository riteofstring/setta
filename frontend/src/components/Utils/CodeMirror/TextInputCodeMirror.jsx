import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useMemo, useState } from "react";
import {
  dbTextFieldCompletion,
  dbTextFieldInitializeCode,
} from "requests/sections";
import { variableClick } from "state/actions/keyActivations";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getKeywordStylizer } from "./getKeywordStylizer";
import { getCompletionsFn, getOnCreateEditor } from "./getOnCreateEditor";

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
  autocomplete = true,
  initializeGenCode = true,
  isKeyName = false,
}) {
  const [activationEvent, setActivationEvent] = useState(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const theme = useCodeMirrorStyle(color);
  // console.log(
  //   "TextInputCodeMirror",
  //   paramInfoId,
  //   isKeyName,
  //   value,
  //   realIsInitialized,
  // );

  function localOnBlur() {
    console.log("localOnBlur", paramInfoId, isKeyName);
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      console.log("setActivationEvent", paramInfoId, isKeyName, activationEvent)
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 1000);
    onBlur?.();
  }

  function localOnMouseDown(event) {
    console.log("mousedown", paramInfoId, isKeyName);
    // if (!variableClick(event)) {
    if (!variableClick(event) && event.button === 0) {
      console.log("settingActivationEvent", paramInfoId, isKeyName, event);
      setActivationEvent(event);
      // if (sectionIdToBeActive) {
      //   setActiveSectionIdAndUpdateZIndex(sectionIdToBeActive);
      // }
    }
  }
  console.log("activationEvent", paramInfoId, isKeyName, activationEvent);

  // focused via tab key
  function onFocus() {
    console.log("onFocus", paramInfoId, isKeyName);
    if (initializeGenCode) {
      dbTextFieldInitializeCode({ sectionId, paramInfoId });
    }
    if (!activationEvent) {
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
          setKeywordPositions={setKeywordPositions}
          language={language}
          autocomplete={autocomplete}
          isKeyName={isKeyName}
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
  setKeywordPositions,
  language,
  autocomplete,
  isKeyName,
}) {
  const divId = `CodeMirror-${sectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;

  const keywordStylizer = useMemo(
    () => getKeywordStylizer(keywordPositions),
    [JSON.stringify(keywordPositions)],
  );

  const completionsFn = useCallback(
    autocomplete
      ? getCompletionsFn(
          sectionId,
          paramInfoId,
          dbTextFieldCompletion,
          setKeywordPositions,
        )
      : () => null,
    [sectionId, paramInfoId, autocomplete],
  );

  const extensions = getExtensions({
    sectionId,
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
