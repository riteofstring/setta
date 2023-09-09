import { matchSorter } from "match-sorter";
import { useSectionParamFilter } from "models/info/sectionParamFilter";
import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({ sectionId, objInfoId, infos }) {
  const paramFilter = useSectionParamFilter((x) => x.x[sectionId]);
  const filteredInfos = paramFilter
    ? matchSorter(infos, paramFilter, { keys: ["name"] })
    : infos;

  return filteredInfos.map((e, idx) => (
    <ParamSwitch
      key={`${e.name}-${idx}`}
      sectionId={sectionId}
      objInfoId={objInfoId}
      paramInfo={e}
      isKwarg={e.editable}
    />
  ));
}
