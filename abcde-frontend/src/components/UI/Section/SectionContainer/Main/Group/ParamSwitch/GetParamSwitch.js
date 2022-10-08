import { FormControl } from "@chakra-ui/react";
import {
  useInitializeEnteredValue,
  useParamEnteredValue,
} from "hooks/useEnteredValue";
import { useDeleteKwarg } from "hooks/useKwarg";
import { useParamChildId } from "hooks/useParamInfo";
import { useGetParamUIType, useInitializeUIType } from "hooks/useUIType";

import ParamSwitch from "./ParamSwitch";

export default function GetParamSwitch({
  sectionId,
  infos,
  isKwarg = false,
  objInfoId,
}) {
  const childIdFn = useParamChildId(sectionId);
  const getUITypeFn = useGetParamUIType(sectionId);
  const enteredValueFn = useParamEnteredValue(sectionId);
  const getInitUITypeFn = useInitializeUIType(sectionId);
  const getInitEnteredValueFn = useInitializeEnteredValue(sectionId);
  const getDeleteKwargFn = useDeleteKwarg(sectionId, objInfoId);
  return (
    infos.length > 0 && (
      <FormControl>
        {infos.map((e, idx) => (
          <ParamSwitch
            key={`${e.name}-${idx}`}
            sectionId={sectionId}
            paramInfo={e}
            childIdFn={childIdFn}
            getUITypeFn={getUITypeFn}
            enteredValueFn={enteredValueFn}
            getInitUITypeFn={getInitUITypeFn}
            getInitEnteredValueFn={getInitEnteredValueFn}
            getDeleteKwargFn={getDeleteKwargFn}
            isKwarg={isKwarg}
          />
        ))}
      </FormControl>
    )
  );
}
