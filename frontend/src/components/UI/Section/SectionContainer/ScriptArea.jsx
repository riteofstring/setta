import { useGetSectionInfo } from "hooks/useSectionInfo";
import React from "react";
import { setSectionInfoAttr } from "thunks/sections/setters";

function _ScriptArea({ sectionId }) {
  const value = useGetSectionInfo(sectionId, "script");
  function onChange(e) {
    setSectionInfoAttr({ sectionId, attr: "script", value: e.target.value });
  }

  return (
    <article className="nodrag card-fullsize relative flex flex-grow overflow-clip rounded-lg border border-runcoder-100 bg-runcoder-50 p-4  dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
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

export const ScriptArea = React.memo(_ScriptArea);
