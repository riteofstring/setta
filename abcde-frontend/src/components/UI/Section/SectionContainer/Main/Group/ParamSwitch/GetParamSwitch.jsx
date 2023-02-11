import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({ sectionId, objInfoId, infos, isKwarg }) {
  return infos.map((e, idx) => (
    <ParamSwitch
      key={`${e.name}-${idx}`}
      sectionId={sectionId}
      objInfoId={objInfoId}
      paramInfo={e}
      isKwarg={isKwarg}
    />
  ));
}
