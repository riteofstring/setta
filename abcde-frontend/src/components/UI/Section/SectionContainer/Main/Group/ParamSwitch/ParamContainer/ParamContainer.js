import { HStack, Spacer, FormControl } from "@chakra-ui/react";

import { useGetUITypeConfig } from "../../../../../../../../utils/useCreateInfo";
import ParamInput from "./ParamItems/ParamInput";
import NestedObjectInput from "./ParamUIs/NestedObjectInput";

export default function ParamContainer(props) {
  const { sectionId, paramInfo, enteredValueFn, childIdFn, getUITypeFn } =
    props;
  const uiType = getUITypeFn(paramInfo);
  const uiTypeConfig = useGetUITypeConfig(uiType);

  console.log("ParamContainer");

  // const paramUITypeConfig = useStoreState((state) =>
  //   state.master.sections.getParamUITypeConfig(sectionId, paramName)
  // );

  // console.log("ParamContainer uiType.isNested", paramInfo, uiType.isNested());

  return !uiType.isNested() ? (
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
            paramInfo={paramInfo}
            uiType={uiType}
            uiTypeConfig={uiTypeConfig}
            isDisabled={!paramInfo.name}
            enteredValueFn={enteredValueFn}
            childIdFn={childIdFn}
          />
        </HStack>
      </FormControl>
    </>
  ) : (
    <NestedObjectInput
      sectionId={sectionId}
      paramName={paramInfo.name}
      uiType={uiType}
      uiTypeConfig={uiTypeConfig}
      parentParamInfoId={paramInfo.id}
    />
  );
}
