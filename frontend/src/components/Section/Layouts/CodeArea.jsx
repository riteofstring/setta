import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useKeywordStylizer } from "components/Utils/CodeMirror/useKeywordStylizer";
import _ from "lodash";
import React from "react";
import {
  dbCodeAreaCompletion,
  dbCodeAreaInitializeCode,
} from "requests/sections";
import { setWaitingForLSP } from "state/actions/lsp";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useKeywordRegex } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";

function getCompletionsFn({ sectionId }) {
  return async (context) => {
    const fullText = context.state.doc.toString();
    if (!fullText.trim()) return null;
    const before = context.matchBefore(/([^.=\\(+-\/ ]*)$/);
    const setToNotWaiting = setWaitingForLSP({ sectionId });
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
    console.log("res", res);
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
  const extensions = useMemo(
    () =>
      getExtensions({
        sectionId,
        language,
        completionsFn,
        keywordStylizer,
      }),
    [],
  );

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

  return (
    <article className="nodrag nowheel section-full-no-title cursor-auto overflow-auto [&_*]:!outline-0 ">
      <CodeMirror
        value={value}
        theme={theme}
        extensions={extensions}
        onMouseDown={onMouseDown}
        onChange={onChange}
      />
    </article>
  );
}

export const CodeArea = React.memo(_CodeArea);
