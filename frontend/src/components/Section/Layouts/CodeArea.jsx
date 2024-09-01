import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useKeywordStylizer } from "components/Utils/CodeMirror/useKeywordStylizer";
import _ from "lodash";
import React, { useCallback, useEffect, useRef } from "react";
import {
  dbCodeAreaCompletion,
  dbCodeAreaInitializeCode,
} from "requests/sections";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useKeywordRegex, useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";

function getCompletionsFn({ sectionId }) {
  return async (context) => {
    const fullText = context.state.doc.toString();
    if (!fullText.trim()) return null;
    const before = context.matchBefore(/([^.=\\(+-\/ ]*)$/);
    const setToNotWaiting = setTextFieldWaitingForLSP({ sectionId });
    const head = context.state.selection.main.head;
    const cursor = context.state.doc.lineAt(head);
    const res = await dbCodeAreaCompletion({
      sectionId,
      fullText,
      beforeText: before.text,
      line: cursor.number - 1,
      column: head - cursor.from - 1,
    });
    setToNotWaiting();
    // console.log("res", res);
    if (res) {
      return {
        filter: true,
        from: before ? before.from : context.pos,
        options: res,
        // validFor: /([^.=\\(]*)$/,
      };
    }
    return null;
  };
}

function _CodeArea({ sectionId }) {
  const resizeEvent = useSectionInfos((x) => x.x[sectionId].resizeEvent);
  const height = useSectionInfos((x) => x.x[sectionId].size.height);
  const value = useGetSectionInfo(sectionId, "code");
  const language = useGetSectionInfo(sectionId, "codeLanguage");
  const theme = useCodeMirrorStyle();
  const pattern = useKeywordRegex((x) => x.pattern, _.isEqual);
  const { keywordStylizer } = useKeywordStylizer({
    pattern,
    sectionId,
    paramInfoId: null,
  });
  const completionsFn = getCompletionsFn({ sectionId });
  const extensions = getExtensions({
    sectionId,
    language,
    completionsFn,
    keywordStylizer,
    onModEnterDoNothing: true,
  });

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

export const CodeArea = React.memo(_CodeArea);
