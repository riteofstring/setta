import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";

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
      <Editor value={value} />
    </article>
  );
}

export const VarControlArea = React.memo(_VarControlArea);

function Editor({ value }) {
  // const [value, setValue] = React.useState("console.log('hello world!');");
  const onChange = React.useCallback((val, viewUpdate) => {
    console.log("val:", val);
    setValue(val);
  }, []);
  return (
    <CodeMirror
      value={value}
      // height="200px"
      extensions={[javascript()]}
      onChange={onChange}
    />
  );
}
