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
} from "requests/sections";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";

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
  const [localKeywordPositions, setLocalKeywordPositions] = useState([]);
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
    ),
    [sectionId],
  );
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
  const value = useGetSectionInfo(sectionId, "code");

  const { wrapperRef, handleCreateEditor, maxHeight, overflow } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();

  function onChange(v) {
    setSectionInfoAttr({
      sectionId,
      attr: "code",
      value: v,
    });
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
      />
    </article>
  );
}

function useCodeAreaHeight({ sectionId }) {
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
      : `${height - 40}px`;
  const overflow = resizeEvent === "start" ? "overflow-y-auto" : "";

  const editorScrollTop = editorRef.current?.scrollDOM.scrollTop;
  const wrapperScrollTop = wrapperRef.current?.scrollTop;

  useEffect(() => {
    if (resizeEvent === "start") {
      wrapperRef.current.scrollTop = editorScrollTop;
    } else if (resizeEvent === "end") {
      editorRef.current.scrollDOM.scrollTop = wrapperScrollTop;
    }
  }, [resizeEvent]);

  return { wrapperRef, handleCreateEditor, maxHeight, overflow };
}
