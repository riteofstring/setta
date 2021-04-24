import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import { useStoreState } from "easy-peasy";
import NestedObjectInput from "./ParamUIs/NestedObjectInput";

export default function ParamContainer(props) {
  const { sectionId, paramName } = props;

  const uiType = useStoreState((state) =>
    state.master.sections.getParamUIType(sectionId, paramName)
  );

  const paramUITypeConfig = useStoreState((state) =>
    state.master.sections.getParamUITypeConfig(sectionId, paramName)
  );

  return !uiType || !uiType.isNested() ? (
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
            sectionId={sectionId}
            paramName={paramName}
            uiType={uiType}
            paramUITypeConfig={paramUITypeConfig}
            isDisabled={!paramName}
          />
        </HStack>
      </FormControl>
    </>
  ) : (
    <NestedObjectInput
      sectionId={sectionId}
      paramName={paramName}
      uiType={uiType}
      paramUITypeConfig={paramUITypeConfig}
    />
  );
}
