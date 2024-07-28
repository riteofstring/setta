import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import React from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";
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
  // const zoom = useReactFlow(x=>x.transform[2])
  // console.log(zoom)

  return (
    <article className="nodrag nowheel section-full-no-title cursor-auto overflow-auto [&_*]:!outline-0 ">
      <Editor
        value={value}
        onChange={onChange}
        languageExtension={codeLanguageToExtension[codeLanguage]}
      />
    </article>
  );
}

export const CodeArea = React.memo(_CodeArea);

function Editor({ value, onChange, languageExtension }) {
  const theme = useCodeMirrorStyle();
  const maxHeight = "100%";

  const scrollbarThemeOption = EditorView.theme({
    "& .cm-scroller": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-gutters": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-gutter": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
  });

  return (
    <CodeMirror
      value={value}
      theme={theme}
      extensions={
        languageExtension
          ? [languageExtension, EditorView.lineWrapping, scrollbarThemeOption]
          : [EditorView.lineWrapping, scrollbarThemeOption]
      }
      onChange={onChange}
    />
  );
}
