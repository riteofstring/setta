import C from "constants/constants.json";
import React, { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { duplicateDbSource } from "state/actions/sectionVariants";
import { useSectionDBSource } from "state/hooks/sections";

export const DBSources = React.forwardRef(({ sectionId }, ref) => {
  const dbSource = useSectionDBSource(sectionId);
  const [localVal, setLocalVal] = useState(dbSource);

  function onChange(e) {
    setLocalVal(e.target.value);
  }

  function onBlur() {
    setSectionInfoAttr({ sectionId, attr: "dbSource", value: localVal });
    // update sectionVariant dbsource params if necessary
    duplicateDbSource({
      oldDbSource: C.DEFAULT_DB_ALIAS,
      newDbSource: localVal,
    });
  }

  return (
    <input
      type="text"
      value={localVal}
      onChange={onChange}
      onBlur={onBlur}
      className="rounded bg-setta-400 px-4 py-2 text-white dark:bg-setta-800"
    />
  );
});
