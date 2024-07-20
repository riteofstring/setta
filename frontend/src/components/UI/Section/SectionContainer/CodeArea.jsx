import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useSettings } from "models/settings";
import React from "react";
import { setSectionInfoAttr } from "thunks/sections/setters";

const githubDarkTheme = githubDarkInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // fontFamily:
    //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
    // gutterForeground: "#4D4D4C00",
    gutterBorder: "#dddddd00",
  },
});

const githubLightTheme = githubLightInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // gutterForeground: "#4D4D4C00",
    // fontFamily:
    //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
    gutterBorder: "#dddddd00",
  },
});

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
  const darkMode = useSettings((x) => x.darkMode);
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);

  return (
    <CodeMirror
      value={value}
      theme={darkMode ? githubDarkTheme : githubLightTheme}
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
