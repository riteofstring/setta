import C from "constants/constants.json";
import { useState } from "react";
import { setSectionInfoAttr } from "state/actions/setters";
import { useParamInfos } from "state/definitions/paramInfos";
import { useSectionDBSource } from "state/hooks/useGetSectionInfo";

export function DBSources({ sectionId }) {
  const dbSource = useSectionDBSource(sectionId);
  const [localVal, setLocalVal] = useState(dbSource);

  function onChange(e) {
    setLocalVal(e.target.value);
  }

  function onBlur() {
    setSectionInfoAttr({ sectionId, attr: "dbSource", value: localVal });
    // update evCol dbsource params if necessary
    useParamInfos.getState().duplicateDbSource({
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
      className="rounded bg-gray-800 p-2 text-white"
    />
  );
}
