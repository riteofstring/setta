import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { getKeywordStylizer } from "components/Utils/CodeMirror/getKeywordStylizer";
import { getCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dbCodeAreaCompletion,
  dbCodeAreaInitializeCode,
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import { setSectionVariantAttr } from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import {
  useSectionCode,
  useSectionKeywordPositions,
} from "state/hooks/sectionVariants";
import useDeepCompareEffect from "use-deep-compare-effect";
import { asyncDebounce } from "utils/utils";

function _CodeArea({ sectionId }) {
  const language = useGetSectionInfo(sectionId, "codeLanguage");

  switch (language) {
    case "python":
      return <PythonCodeArea sectionId={sectionId} language={language} />;
    case "bash":
      return <BashCodeArea sectionId={sectionId} language={language} />;
    case "javascript":
      return <JavascriptCodeArea sectionId={sectionId} language={language} />;
  }
}

export const CodeArea = React.memo(_CodeArea);

function PythonCodeArea({ sectionId, language }) {
  const keywordPositions = useSectionKeywordPositions(sectionId);
  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);
  const keywordStylizer = useMemo(
    () => getKeywordStylizer(localKeywordPositions),
    [JSON.stringify(localKeywordPositions)],
  );
  const completionsFn = useCallback(
    getCompletionsFn(
      sectionId,
      null,
      dbCodeAreaCompletion,
      setLocalKeywordPositions,
      language,
    ),
    [sectionId],
  );

  useDeepCompareEffect(() => {
    setLocalKeywordPositions(keywordPositions);
  }, [keywordPositions]);

  return (
    <CoreCodeArea
      sectionId={sectionId}
      language={language}
      completionsFn={completionsFn}
      keywordStylizer={keywordStylizer}
    />
  );
}

function BashCodeArea({ sectionId, language }) {
  return <CoreCodeArea sectionId={sectionId} language={language} />;
}

function JavascriptCodeArea({ sectionId, language }) {
  return <CoreCodeArea sectionId={sectionId} language={language} />;
}

function CoreCodeArea({ sectionId, language, completionsFn, keywordStylizer }) {
  const value = useSectionCode(sectionId);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();

  function onChange(v) {
    setSectionVariantAttr(sectionId, "code", v);
    debouncedSetKeywordPositions(sectionId, v);
  }

  function onMouseDown() {
    dbCodeAreaInitializeCode({ sectionId });
  }

  const extensions = getExtensions({
    sectionId,
    language,
    completionsFn,
    keywordStylizer,
    onModEnterDoNothing: true,
    tabToAutocomplete: true,
    indentWithTab: true
  });

  return (
    <article
      ref={wrapperRef}
      className={`nodrag nowheel section-full-no-title cursor-auto [&_*]:!outline-0 ${overflow}`}
    >
      <CodeMirror
        maxHeight={maxHeight}
        value={value}
        theme={theme}
        extensions={extensions}
        onMouseDown={onMouseDown}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false} // I take care of this in getExtensions
      />
    </article>
  );
}

export function useCodeAreaHeight({ sectionId }) {
  const resizeEvent = useSectionInfos((x) => x.x[sectionId].resizeEvent);
  const height = useSectionInfos((x) => x.x[sectionId].size.height);

  const wrapperRef = useRef(null);
  const editorRef = useRef(null);

  const handleCreateEditor = useCallback((view) => {
    editorRef.current = view;
  }, []);

  const maxHeight =
    height === "auto" || resizeEvent === "start"
      ? undefined
      : `${height - 32}px`;
  const overflow = resizeEvent === "start" ? "overflow-y-auto" : "";

  const editorScrollTop = editorRef.current?.scrollDOM.scrollTop;
  const wrapperScrollTop = wrapperRef.current?.scrollTop;

  useEffect(() => {
    if (wrapperRef.current && resizeEvent === "start") {
      wrapperRef.current.scrollTop = editorScrollTop;
    } else if (editorRef.current && resizeEvent === "end") {
      editorRef.current.scrollDOM.scrollTop = wrapperScrollTop;
    }
  }, [resizeEvent]);

  return { wrapperRef, handleCreateEditor, maxHeight, overflow };
}

const debouncedSetKeywordPositions = asyncDebounce(async (sectionId, value) => {
  const { keywordPositions } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId: null,
    fullText: value,
    messageIdSuffix: "-codeArea",
  });
  setSectionVariantAttr(sectionId, "keywordPositions", keywordPositions);
}, 500);
