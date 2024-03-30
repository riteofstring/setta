import { useSectionDBSource } from "hooks/useSectionInfo";
import { useState } from "react";
import { setSectionInfoAttr } from "thunks/sections/setters";

export function DBSources({ sectionId }) {
  const dbSource = useSectionDBSource(sectionId);
  const [localVal, setLocalVal] = useState(dbSource);

  function onChange(e) {
    setLocalVal(e.target.value);
  }

  function onBlur() {
    setSectionInfoAttr({ sectionId, attr: "dbSource", value: localVal });
  }

  return (
    <input
      type="text"
      value={localVal}
      onChange={onChange}
      onBlur={onBlur}
      className="rounded bg-gray-800 p-2 text-white"
    />
  );
}
