import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useSectionInfos, useSectionParamFilter } from "state/definitions";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  ancestorIsSelected = false,
}) {
  const requiredParamIdsWithNames = useSectionInfos(
    (x) =>
      Object.keys(requiredParamIdsToPaths).map((id) => ({
        id,
        name: x.codeInfo[id].name,
      })),
    _.isEqual,
  );

  // TODO: make this more efficient
  const filteredIds = useSectionParamFilter((x) => {
    const matches = matchSorter(
      requiredParamIdsWithNames,
      x.x[sectionId] ?? "",
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
    />
  ));
}
