import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useReactFlow } from "forks/xyflow/core/store";
import React, { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
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
  const [maxHeight, setMaxHeight] = useState(getMaxHeight(height));

  const scrollbarThemeOption = EditorView.theme({
    "& .cm-scroller": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-theme": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-editor": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-focused": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-announced": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
    "& .cm-gutters": {
      minHeight: `${maxHeight} !important`,
      maxHeight: `${maxHeight} !important`,
      height: `${maxHeight} !important`,
    },
  });

  return (
    <CodeMirror
      value={value}
      theme={theme}
      // maxHeight={maxHeight}
      // height="auto"
      // minHeight={`${height}px`}
      // maxHeight={`${height}px`}
      // maxHeight={`${height}px`}
      // width="auto"
      // height="100%"
      // style={{ height: "100%" }}
      extensions={
        languageExtension
          ? [languageExtension, EditorView.lineWrapping, scrollbarThemeOption]
          : [EditorView.lineWrapping, scrollbarThemeOption]
      }
      onChange={onChange}
      onClick={() => setMaxHeight(getMaxHeight(height))}
    />
  );
}

function getMaxHeight(height) {
  const zoom = useReactFlow.getState().transform[2];
  // const output = zoom <= 1 ? `${100}%` : `${50}%`;
  const output = zoom <= 1 ? `${height}px` : `${height}px`;
  console.log("getMaxHeight", output);
  return output;
}
