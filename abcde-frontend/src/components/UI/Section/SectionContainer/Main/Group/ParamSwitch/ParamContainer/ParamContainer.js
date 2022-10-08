import { FormControl, HStack, Spacer } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useGetParamUIType } from "hooks/useParamInfo";
import { useEffect } from "react";
import { requiresNestedSection } from "utils/constants";

import ParamInput from "./ParamItems/ParamInput";
import NestedObjectInput from "./ParamUIs/NestedObjectInput";

export default function ParamContainer(props) {
  const { sectionId, paramInfo, getInitEnteredValueFn } = props;
  const initializeParamUIType = useStoreActions(
    (x) => x.thunks.initializeParamUIType
  );
  const uiType = useGetParamUIType(sectionId, paramInfo.id);
  const initEnteredValueFn = getInitEnteredValueFn(paramInfo.id);
  const uiTypeConfig = uiType.config;

  useEffect(() => {
    initializeParamUIType({ sectionId, paramInfo });
    initEnteredValueFn();
  }, [paramInfo.id]);

  return !requiresNestedSection(uiType.type) ? (
    <>
      <FormControl as="fieldset">
        <HStack
          px=".75rem"
          pb="0.33rem"
          pt="0.33rem"
          borderRadius="full"
          minH="36px"
          _hover={{
            backgroundColor: "#cbd5e02b",
          }}
        >
          {props.children}
          <Spacer />
          <ParamInput
            sectionId={sectionId}
            paramInfoId={paramInfo.id}
            defaultVal={paramInfo.defaultVal}
            uiType={uiType}
            uiTypeConfig={uiTypeConfig}
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
    />
  );
}
