import { FormControl } from "@chakra-ui/react";
import { useInitializeEnteredValue } from "hooks/useEnteredValue";

import ParamSwitch from "./ParamSwitch";

export default function GetParamSwitch({
  sectionId,
  infos,
  isKwarg = false,
  objInfoId,
}) {
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
            getInitEnteredValueFn={getInitEnteredValueFn}
            isKwarg={isKwarg}
          />
        ))}
      </FormControl>
    )
  );
}
