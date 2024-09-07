import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({ sectionId, paramIds, setDidUpdate }) {
  // const paramFilter = useSectionParamFilter((x) => x.x[sectionId]);
  // const filteredInfos = paramFilter
  //   ? matchSorter(infos, paramFilter, { keys: ["name"] })
  //   : infos;

  // do not use e.name as part of the key.
  // It causes remounting of components when
  // kwarg name changes, which messes up textinputcodemirror

  return paramIds.map((e, idx) => (
    <ParamSwitch
      key={e}
      sectionId={sectionId}
      paramInfoId={e}
      setDidUpdate={setDidUpdate}
    />
  ));
}
