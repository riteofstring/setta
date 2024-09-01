import { matchSorter } from "match-sorter";
import { useSectionParamFilter } from "state/definitions";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({ sectionId, parentId, infos, setDidUpdate, notifyParentOfMouseOver }) {
  const paramFilter = useSectionParamFilter((x) => x.x[sectionId]);
  const filteredInfos = paramFilter
    ? matchSorter(infos, paramFilter, { keys: ["name"] })
    : infos;

  return filteredInfos.map((e, idx) => (
    <ParamSwitch
      key={`${e.name}-${idx}`}
      sectionId={sectionId}
      parentId={parentId}
      paramInfo={e}
      isKwarg={e.editable}
      setDidUpdate={setDidUpdate}
      notifyParentOfMouseOver={notifyParentOfMouseOver}
    />
  ));
}
