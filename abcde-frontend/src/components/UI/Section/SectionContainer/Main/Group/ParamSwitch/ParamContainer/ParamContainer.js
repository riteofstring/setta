import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import { useState, useEffect } from "react";
import { useStoreState } from "easy-peasy";
import {
  requiresNestedSection,
  parameterStateDetailsGetter,
} from "../../../../../../../../utils/utils";
import NestedObjectInput from "./ParamUIs/NestedObjectInput";

export default function ParamContainer(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, uiType: defaultUIType },
  } = props;

  const currUIType = useStoreState((state) =>
    parameterStateDetailsGetter(
      state.uiTypes.uiTypes,
      sectionId,
      moduleName,
      objName,
      name
    )
  );

  const currUiTypeConfig = useStoreState(
    (state) =>
      parameterStateDetailsGetter(
        state.uiTypeConfigs.uiTypeConfigs,
        sectionId,
        moduleName,
        objName,
        name
      )?.[currUIType]
  );

  const [uiType, setUIType] = useState(defaultUIType);

  useEffect(() => {
    setUIType(currUIType ? currUIType : defaultUIType);
  }, [currUIType]);

  return !requiresNestedSection(uiType) ? (
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
          {...props}
          uiType={uiType}
          uiTypeConfig={currUiTypeConfig}
          isDisabled={!name}
        />
      </HStack>
    </FormControl>
  ) : (
    <NestedObjectInput
      sectionId={sectionId}
      paramName={name}
      uiType={uiType}
    />
  );
}
