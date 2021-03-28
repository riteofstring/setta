import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import PrefButton from "./ParamItems/ParamPref/PrefButton";
import { useState, useLayoutEffect } from "react";
import { useStoreActions } from "easy-peasy";

export default function ParamContainer(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, defaultUIType },
  } = props;

  const [uiType, setUIType] = useState(defaultUIType);

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const requiresInputHere = () => {
    return !["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(uiType);
  };

  useLayoutEffect(() => {
    if (!requiresInputHere()) {
      addToVisibleSectionIdsThunk({
        name,
        parentId: sectionId,
        moduleName,
        objName,
        isList: uiType === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
    }
  }, [sectionId, moduleName, objName]);

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
          <PrefButton onClick={setUIType} />
          <ParamInput {...props} uiType={uiType} />
        </HStack>
      </FormControl>
    )
  );
}
