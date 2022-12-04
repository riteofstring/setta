import ParamSwitch from "./ParamSwitch";

export default function GetParamSwitch({
  sectionId,
  infos = [],
  isKwarg = false,
  objInfoId,
}) {
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
