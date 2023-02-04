import { ParamSwitch } from "./ParamSwitch";

export function GetParamSwitch({ sectionId, objInfoId, params, kwargs }) {
  const allInfo = { params, kwargs };

  return Object.keys(allInfo).map((k) =>
    allInfo[k].map((e, idx) => (
      <ParamSwitch
        key={`${e.name}-${idx}`}
        sectionId={sectionId}
        objInfoId={objInfoId}
        paramInfo={e}
        isKwarg={k === "kwargs"}
      />
    ))
  );
}
