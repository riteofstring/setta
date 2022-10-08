import { FormControl } from "@chakra-ui/react";
import { useInitializeEnteredValue } from "hooks/useEnteredValue";
import { useGetParamUIType, useInitializeUIType } from "hooks/useUIType";

import ParamSwitch from "./ParamSwitch";

export default function GetParamSwitch({
  sectionId,
  infos,
  isKwarg = false,
  objInfoId,
}) {
  const getUITypeFn = useGetParamUIType(sectionId);
  const getInitUITypeFn = useInitializeUIType(sectionId);
  const getInitEnteredValueFn = useInitializeEnteredValue(sectionId);
  return (
    infos.length > 0 && (
      <FormControl>
        {infos.map((e, idx) => (
          <ParamSwitch
            key={`${e.name}-${idx}`}
            sectionId={sectionId}
            objInfoId={objInfoId}
            paramInfo={e}
            getUITypeFn={getUITypeFn}
            getInitUITypeFn={getInitUITypeFn}
            getInitEnteredValueFn={getInitEnteredValueFn}
            isKwarg={isKwarg}
          />
        ))}
      </FormControl>
    )
  );
}
