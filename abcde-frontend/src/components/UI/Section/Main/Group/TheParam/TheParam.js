import { Text, HStack, Input, Spacer, FormLabel } from "@chakra-ui/react";
import ParamSweepButton from "./ParamSweepUI/ParamSweepButton";
import PinButton from "./PinButton/PinButton";
import React, { useState, useLayoutEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function TheParam({ parameters }) {
  const { name, ui_type, default_val } = parameters;

  const setCurrParam = useStoreActions(
    (actions) => actions.globalCurr.setCurrParam
  );

  const addToVisibleSectionIdsThunk = useStoreActions(
    (actions) => actions.master.addToVisibleSectionIdsThunk
  );

  const globalCurr = useStoreState(
    (state) => state.globalCurr.globalCurr,
    (prev, next) => checkGlobalCurrEquality(prev, next)
  );
  const sectionId = useStoreState((state) => state.globalCurr.sectionId);
  const moduleName = useStoreState((state) => state.globalCurr.moduleName);
  const objName = useStoreState((state) => state.globalCurr.objName);
  const isListRoot = useStoreState(
    (state) => state.master.isListRoot[sectionId]
  );

  const [value, setValue] = useState(default_val);

  const checkGlobalCurrEquality = (prev, next) => {
    let prevParam = null;
    let nextParam = null;
    try {
      prevParam = prev[sectionId][moduleName][objName][name];
    } catch (err) {}
    try {
      nextParam = next[sectionId][moduleName][objName][name];
    } catch (err) {}
    return prevParam === nextParam;
  };

  const sendState = (name, value) => {
    setValue(value);
    setCurrParam({ paramName: name, paramValue: value });
  };

  useLayoutEffect(() => {
    let savedParam = null;

    try {
      savedParam = globalCurr[sectionId][moduleName][objName][name];
    } catch (err) {}

    setValue(
      savedParam !== null && savedParam !== undefined ? savedParam : default_val
    );

    if (
      !isListRoot &&
      ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(ui_type)
    ) {
      addToVisibleSectionIdsThunk({
        name,
        parentId: sectionId,
        moduleName,
        objName,
        isList: ui_type === "LIST_NESTED_OBJECT",
        siblingId: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, moduleName, objName]);

  const inputSwitch = () => {
    switch (ui_type) {
      // case "NUM":
      //   return (
      //     <NumberInput>
      //       <NumberInputField />
      //       <NumberInputStepper>
      //         <NumberIncrementStepper />
      //         <NumberDecrementStepper />
      //       </NumberInputStepper>
      //     </NumberInput>
      //   );
      // case "LIST_NESTED_OBJECT":
      // case "NESTED_OBJECT":
      //   return <Box>Nested Function</Box>;
      // case "LIST":
      //   return <Box>It's a list bro!</Box>;
      // case "OPTION":
      //   return <Switch />;
      // case "TEXT":
      default:
        return (
          <Input
            type="groupone"
            variant="flushed"
            placeholder={default_val}
            size="xs"
            maxWidth="10rem"
            value={value}
            onChange={(e) => sendState(name, e.target.value)}
          />
        );
    }
  };

  return (
    <HStack>
      <FormLabel>
        <Text fontSize="sm" fontWeight="semibold" color="gray.700">
          {name}
        </Text>
      </FormLabel>
      <PinButton />
      <Spacer />
      <ParamSweepButton key={name}/>
      {inputSwitch()}
    </HStack>
  );
}
