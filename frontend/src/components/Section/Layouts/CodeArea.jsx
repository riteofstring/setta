import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import {
  getLanguageExtension,
  useCodeMirrorStyle,
} from "components/Utils/CodeMirror/useCodeMirrorStyle";
import React from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

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
        languageExtension={getLanguageExtension(codeLanguage)}
      />
    </article>
  );
}

export const CodeArea = React.memo(_CodeArea);

function Editor({ value, onChange, languageExtension }) {
  const theme = useCodeMirrorStyle();

  return (
    <CodeMirror
      value={value}
      theme={theme}
      extensions={
        languageExtension
          ? [languageExtension, EditorView.lineWrapping]
          : [EditorView.lineWrapping]
      }
      onChange={onChange}
    />
  );
}
