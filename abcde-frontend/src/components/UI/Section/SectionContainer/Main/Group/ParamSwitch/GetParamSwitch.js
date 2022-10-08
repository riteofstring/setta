import { FormControl } from "@chakra-ui/react";
import ParamSwitch from "./ParamSwitch";

export default function GetParamSwitch({
  sectionId,
  infos,
  isKwarg = false,
  objInfoId,
}) {
  return (
    infos.length > 0 && (
      <FormControl>
        {infos.map((e, idx) => (
          <ParamSwitch
            key={`${e.name}-${idx}`}
            sectionId={sectionId}
            objInfoId={objInfoId}
            paramInfo={e}
            isKwarg={isKwarg}
          />
        ))}
      </FormControl>
    )
  );
}
