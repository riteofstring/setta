import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useSectionInfos } from "state/definitions";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  ancestorIsSelected = false,
  onResizeStart,
  baseColumnWidth,
}) {
  // TODO: make this more efficient
  const filteredIds = useSectionInfos((x) => {
    if (!x.x[sectionId].paramFilter) {
      return paramIds;
    }

    const requiredParamIdsWithNames = Object.keys(requiredParamIdsToPaths).map(
      (id) => ({
        id,
        name: x.codeInfo[id].name,
      }),
    );

    const matches = matchSorter(
      requiredParamIdsWithNames,
      x.x[sectionId].paramFilter,
      {
        keys: ["name"],
      },
    );
    const filteredRequired = new Set();
    for (const m of matches) {
      for (const p of requiredParamIdsToPaths[m.id]) {
        filteredRequired.add(p);
      }
    }

    return paramIds.filter((p) => filteredRequired.has(p));
  }, _.isEqual);

  return filteredIds.map((e) => (
    <ParamSwitch
      key={e}
      sectionId={sectionId}
      paramInfoId={e}
      requiredParamIdsToPaths={requiredParamIdsToPaths}
      ancestorIsSelected={ancestorIsSelected}
      onResizeStart={onResizeStart}
      baseColumnWidth={baseColumnWidth}
    />
  ));
}
