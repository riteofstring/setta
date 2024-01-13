import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";
import { setSectionInfoAttr } from "thunks/sections/setters";

function _VarControlArea({ sectionId }) {
  const value = useGetSectionInfo(sectionId, "varControl");
  function onChange(e) {
    setSectionInfoAttr({
      sectionId,
      attr: "varControl",
      value: e.target.value,
    });
  }

  return (
    <textarea
      className="nodrag card-code mb-2 resize-none bg-transparent pr-4 font-mono text-xs outline-none dark:text-runcoder-300"
      value={value}
      onChange={onChange}
      placeholder="JSON, state 'em..."
      spellCheck={false}
    />
  );
}

export const VarControlArea = React.memo(_VarControlArea);
