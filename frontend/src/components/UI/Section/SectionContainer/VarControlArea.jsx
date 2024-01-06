import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { githubDarkInit, githubLightInit } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useSettings } from "models/settings";
import React from "react";

const githubDarkTheme = githubDarkInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // gutterForeground: "#4D4D4C00",
    gutterBorder: "#dddddd00",
  },
});

const githubLightTheme = githubLightInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // gutterForeground: "#4D4D4C00",
    gutterBorder: "#dddddd00",
  },
});

function _VarControlArea({ sectionId }) {
  const value = useGetSectionInfo(sectionId, "varControl");
  // function onChange(e) {
  //   setSectionInfoAttr({
  //     sectionId,
  //     attr: "varControl",
  //     value: e.target.value,
  //   });
  // }
  //   <textarea
  //   className="nodrag card-code mb-2 resize-none bg-transparent pr-4 font-mono text-xs outline-none dark:text-runcoder-300"
  //   value={value}
  //   onChange={onChange}
  //   placeholder="JSON, state 'em..."
  //   spellCheck={false}
  // />

  return (
    <article className="nodrag card-code mb-2">
      <Editor sectionId={sectionId} value={value} />
    </article>
  );
}

export const VarControlArea = React.memo(_VarControlArea);

function Editor({ sectionId, value }) {
  const darkMode = useSettings((x) => x.darkMode);
  // const [value, setValue] = React.useState("console.log('hello world!');git pu");
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);
  const onChange = React.useCallback((val, viewUpdate) => {
    console.log("val:", val);
    setValue(val);
  }, []);
  return (
    <CodeMirror
      value={value}
      theme={darkMode ? githubDarkTheme : githubLightTheme}
      height={`${height - 50}px`}
      width={`${width - 50}px`}
      extensions={[javascript(), EditorView.lineWrapping]}
      onChange={onChange}
    />
  );
}
