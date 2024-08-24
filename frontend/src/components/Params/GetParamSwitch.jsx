import { matchSorter } from "match-sorter";
import { useSectionParamFilter } from "state/definitions";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({ sectionId, parentId, infos, setDidUpdate }) {
  const paramFilter = useSectionParamFilter((x) => x.x[sectionId]);
  const filteredInfos = paramFilter
    ? matchSorter(infos, paramFilter, { keys: ["paramInfo.name"] })
    : infos;

  return filteredInfos.map(({paramInfo, depth}, idx) => (
    <ParamSwitch
      key={`${paramInfo.name}-${idx}`}
      sectionId={sectionId}
      parentId={parentId}
      paramInfo={paramInfo}
      isKwarg={paramInfo.editable}
      setDidUpdate={setDidUpdate}
      depth={depth}
    />
  ));
}
