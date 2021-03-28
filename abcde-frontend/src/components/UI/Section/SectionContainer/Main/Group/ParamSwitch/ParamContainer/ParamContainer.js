import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import PrefButton from "./ParamItems/ParamPref/PrefButton";
import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function ParamContainer(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, defaultUIType },
  } = props;

  const currUIType = useStoreState(
    (state) => state.uiTypes.uiTypes[sectionId]?.[moduleName]?.[objName]?.[name]
  );

  const [uiType, setUIType] = useState(defaultUIType);

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const requiresInputHere = () => {
    return !["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(uiType);
  };

  useEffect(() => {
    if (!requiresInputHere()) {
      const nestedSectionId = addToVisibleSectionIdsThunk({
        name,
        parentId: sectionId,
        moduleName,
        objName,
        isList: uiType === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
    }
  }, [uiType]);

  useEffect(() => {
    setUIType(
      currUIType !== null && currUIType !== undefined
        ? currUIType
        : defaultUIType
    );
  }, [currUIType]);

  return (
    requiresInputHere() && (
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
          {/* <PrefButton onClick={updateUIType} /> */}
          <ParamInput {...props} uiType={uiType} />
        </HStack>
      </FormControl>
    )
  );
}
