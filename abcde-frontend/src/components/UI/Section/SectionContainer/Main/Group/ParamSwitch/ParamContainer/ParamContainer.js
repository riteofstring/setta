import { FormControl, HStack, Spacer } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useGetParamUIType } from "hooks/useParamInfo";
import { useEffect } from "react";
import { requiresNestedSection } from "utils/constants";
import ParamInput from "./ParamItems/ParamInput";

export default function ParamContainer(props) {
  const { sectionId, paramInfo } = props;
  const initializeParam = useStoreActions((x) => x.thunks.initializeParam);
  const uiType = useGetParamUIType(sectionId, paramInfo.id);

  useEffect(() => {
    initializeParam({ sectionId, paramInfo });
  }, [paramInfo.id]);

  return (
    !requiresNestedSection(uiType.type) && (
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
            isDisabled={!paramInfo.name}
          />
        </HStack>
      </FormControl>
    )
  );
}
