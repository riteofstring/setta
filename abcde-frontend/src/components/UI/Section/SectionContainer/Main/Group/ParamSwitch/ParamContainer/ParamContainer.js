import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import PrefButton from "./ParamItems/ParamPref/PrefButton";
import { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { checkGlobalCurrEquality } from "../../../../../../../../utils/utils";

export default function ParamContainer(props) {
  const {
    sectionId,
    moduleName,
    objName,
    parameter: { name, defaultUIType },
  } = props;

  const [uiType, setUIType] = useState(defaultUIType);

  const equalityFn = checkGlobalCurrEquality(
    sectionId,
    moduleName,
    objName,
    name
  );

  const uiTypes = useStoreState(
    (state) => state.uiTypes.uiTypes,
    (prev, next) => equalityFn(prev, next)
  );

  const setCurrUIType = useStoreActions(
    (actions) => actions.uiTypes.setCurrUIType
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const requiresInputHere = (inputUIType = null) => {
    return !["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(
      inputUIType !== null ? inputUIType : uiType
    );
  };

  const updateUIType = (value) => {
    setUIType(value);
    setCurrUIType({
      sectionId,
      moduleName,
      objName,
      paramName: name,
      uiType: value,
    });
  };

  useEffect(() => {
    let savedUIType = null;

    try {
      savedUIType = uiTypes[sectionId][moduleName][objName][name];
    } catch (err) {}

    const toBeSet =
      savedUIType !== null && savedUIType !== undefined
        ? savedUIType
        : defaultUIType;
    setUIType(toBeSet);

    if (!requiresInputHere(toBeSet)) {
      addToVisibleSectionIdsThunk({
        name,
        parentId: sectionId,
        moduleName,
        objName,
        isList: uiType === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
    }
  }, [sectionId, moduleName, objName, requiresInputHere()]);

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
          <PrefButton onClick={updateUIType} />
          <ParamInput {...props} uiType={uiType} />
        </HStack>
      </FormControl>
    )
  );
}
