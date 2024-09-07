import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIds,
  setDidUpdate,
}) {
  // const paramFilter = useSectionParamFilter((x) => x.x[sectionId]);
  // const filteredInfos = paramFilter
  //   ? matchSorter(infos, paramFilter, { keys: ["name"] })
  //   : infos;

  // do not use e.name as part of the key.
  // It causes remounting of components when
  // kwarg name changes, which messes up textinputcodemirror

  const filteredIds = paramIds.filter((x) => requiredParamIds.has(x));

  return filteredIds.map((e) => (
    <ParamSwitch
      key={e}
      sectionId={sectionId}
      paramInfoId={e}
      requiredParamIds={requiredParamIds}
      setDidUpdate={setDidUpdate}
    />
  ));
}
