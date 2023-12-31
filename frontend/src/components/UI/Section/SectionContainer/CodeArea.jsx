import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";
import { setSectionInfoAttr } from "thunks/sections/setters";

function _CodeArea({ sectionId }) {
  const value = useGetSectionInfo(sectionId, "code");
  function onChange(e) {
    setSectionInfoAttr({ sectionId, attr: "code", value: e.target.value });
  }

  return (
    <article className="nodrag card-fullsize relative flex overflow-clip rounded-lg border border-runcoder-100 bg-runcoder-50 p-4  dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
      <textarea
        className="overflow-y flex-grow resize-none bg-transparent font-mono text-xs outline-none"
        value={value}
        onChange={onChange}
        placeholder="JSON, state 'em..."
        spellCheck={false}
      />
    </article>
  );
}

export const CodeArea = React.memo(_CodeArea);
