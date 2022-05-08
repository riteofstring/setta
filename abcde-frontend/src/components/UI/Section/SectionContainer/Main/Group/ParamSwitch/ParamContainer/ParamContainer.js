import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import { useEffect } from "react";
import { requiresNestedSection } from "utils/constants";

import ParamInput from "./ParamItems/ParamInput";
import NestedObjectInput from "./ParamUIs/NestedObjectInput";

export default function ParamContainer(props) {
  const {
    sectionId,
    paramInfo,
    childIdFn,
    getUITypeFn,
    enteredValueFn,
    getInitUITypeFn,
    getInitEnteredValueFn,
  } = props;
  const uiType = getUITypeFn(paramInfo.id);
  const initUITypeFn = getInitUITypeFn(paramInfo);
  const initEnteredValueFn = getInitEnteredValueFn(paramInfo.id);
  console.log("ParamContainer");
  const uiTypeConfig = uiType.config;

  useEffect(() => {
    initUITypeFn();
    initEnteredValueFn();
  }, [paramInfo.id]);

  return !requiresNestedSection(uiType.type) ? (
    <>
      <FormControl as="fieldset">
        <HStack
          px=".75rem"
          pb="0.5rem"
          pt="0.25rem"
          borderRadius=".5rem"
          _hover={{
            backgroundColor: "white",
          }}
        >
          {props.children}
          <Spacer />
          <ParamInput
            paramInfoId={paramInfo.id}
            defaultVal={paramInfo.defaultVal}
            uiType={uiType}
            uiTypeConfig={uiTypeConfig}
            enteredValueFn={enteredValueFn}
            isDisabled={!paramInfo.name}
          />
        </HStack>
      </FormControl>
    </>
  ) : (
    <NestedObjectInput
      sectionId={sectionId}
      paramName={paramInfo.name}
      uiTypeId={uiType.id}
      parentParamInfoId={paramInfo.id}
      childIdFn={childIdFn}
    />
  );
}
