import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { useCallback, useState } from "react";
import { dbTextFieldInitializeCode } from "requests/sections";
import { variableClick } from "state/actions/keyActivations";
import { useKeywordRegex } from "state/definitions";
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
}) {
  const [activationEvent, setActivationEvent] = useState(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const pattern = useKeywordRegex((x) => x.pattern, _.isEqual);
  const theme = useCodeMirrorStyle(color);

  function localOnBlur() {
    setActivationEvent(null);
    setRealIsInitialized(false);
    onBlur?.();
  }

  function onMouseDown(event) {
    // if (!variableClick(event)) {
    if (!variableClick(event) && event.button === 0) {
      dbTextFieldInitializeCode({ sectionId, paramInfoId });
      setActivationEvent(event);
    }
  }

  return (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          code={value}
          onMouseDown={onMouseDown}
          className={dummyCodeClassName}
          theme={theme}
          keywordRegex={pattern}
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
          keywordRegex={pattern}
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
  keywordRegex,
  language,
}) {
  const divId = `CodeMirror-${sectionId}-${paramInfoId}`;

  const { keywordLocations, keywordStylizer } = useKeywordStylizer({
    pattern: keywordRegex,
    sectionId,
    paramInfoId,
  });

  const completionsFn = useCallback(getCompletionsFn(sectionId, paramInfoId), [
    sectionId,
    paramInfoId,
  ]);

  const extensions = getExtensions({
    sectionId,
    language,
    completionsFn,
    keywordStylizer,
    singleLine,
    tabToAutocomplete: true,
    onEnter,
    onEscape
  });

  const onCreateEditor = getOnCreateEditor({
    keywordLocations,
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
