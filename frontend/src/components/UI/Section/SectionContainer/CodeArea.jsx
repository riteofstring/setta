import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import React from "react";
import { setSectionInfoAttr } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useGetSectionInfo } from "state/hooks/useGetSectionInfo";
import { useCodeMirrorStyle } from "utils/CodeMirror/useCodeMirrorStyle";

const javascriptExtension = javascript();
const pythonExtension = python();
const codeLanguageToExtension = {
  javascript: javascriptExtension,
  python: pythonExtension,
  bash: null,
};

function _CodeArea({ sectionId }) {
  const value = useGetSectionInfo(sectionId, "code");
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");
  function onChange(v) {
    setSectionInfoAttr({
      sectionId,
      attr: "code",
      value: v,
    });
  }

  return (
    <article className="nodrag nowheel card-code mb-2 cursor-auto overflow-clip">
      <Editor
        sectionId={sectionId}
        value={value}
        onChange={onChange}
        languageExtension={codeLanguageToExtension[codeLanguage]}
      />
    </article>
  );
}

export const CodeArea = React.memo(_CodeArea);

function Editor({ sectionId, value, onChange, languageExtension }) {
  const theme = useCodeMirrorStyle();
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);

  return (
    <CodeMirror
      value={value}
      theme={theme}
      height={`${height}px`}
      width={`${width}px`}
      extensions={
        languageExtension
          ? [languageExtension, EditorView.lineWrapping]
          : [EditorView.lineWrapping]
      }
      onChange={onChange}
    />
  );
}
