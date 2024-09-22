import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({
  sectionId,
  paramIds,
  requiredParamIds,
  setDidUpdate,
  ancestorIsSelected = false,
}) {
  const filteredIds = paramIds.filter((x) => requiredParamIds.has(x));

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
