import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCodeInfo, useSectionParamFilter } from "state/definitions";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIds,
  setDidUpdate,
  ancestorIsSelected = false,
}) {
// TODO: change requiredParamIds to be a mapping from
// required id to param path.
// Filter the required ids using matchSorter.
// Then filter paramIds by whether each id appears in any of the parama paths.

  const requiredParamIdsWithNames = useCodeInfo((x) => {
    const output = [];
    for (const id of requiredParamIds) {
      output.push({ id, name: x.x[id].name });
    }
    return output;
  });
  const filteredRequiredIds = useSectionParamFilter((x) => {
    const matches = matchSorter(
      requiredParamIdsWithNames,
      x.x[sectionId] ?? "",
      {
        keys: ["name"],
      },
    );
    return new Set(matches.map((m) => m.id));
  }, _.isEqual);

  console.log("filteredRequiredIds", filteredRequiredIds)

  const filteredIds = paramIds.filter((x) => filteredRequiredIds.has(x));

  return filteredIds.map((e) => (
    <ParamSwitch
      key={e}
      sectionId={sectionId}
      paramInfoId={e}
      requiredParamIds={requiredParamIds}
      setDidUpdate={setDidUpdate}
      ancestorIsSelected={ancestorIsSelected}
    />
  ));
}
