import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import {
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Box,
  Switch,
} from "@chakra-ui/react";

const TheParam = ({ parameters }) => {
  const { name, ui_type, default_val } = parameters;

  const { setCurrParam } = useStoreActions((actions) => actions.globalCurr);

  const { addToVisibleSectionIdsThunk } = useStoreActions(
    (actions) => actions.master
  );

  const { globalCurr, sectionId, moduleName, objName } = useStoreState(
    (state) => state.globalCurr
  );

  const [value, setValue] = useState(default_val);

  const sendState = (name, value) => {
    setValue(value);
    setCurrParam({ paramName: name, paramValue: value });
  };

  useEffect(() => {
    if (ui_type === "NESTED_OBJECT") {
      addToVisibleSectionIdsThunk({ name });
    } else if (ui_type === "LIST_NESTED_OBJECT") {
      addToVisibleSectionIdsThunk({ name, isList: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters]);

  useEffect(() => {
    let savedParam = null;
    if (sectionId in globalCurr) {
      if (moduleName in globalCurr[sectionId]) {
        if (objName in globalCurr[sectionId][moduleName]) {
          savedParam = globalCurr[sectionId][moduleName][objName][name];
        }
      }
    }
    setValue(savedParam ? savedParam : default_val);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters, objName]);

  const inputSwitch = () => {
    switch (ui_type) {
      case "NUM":
        return (
          <NumberInput>
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        );
      case "LIST_NESTED_OBJECT":
      case "NESTED_OBJECT":
        return <Box>Nested Function</Box>;
      case "LIST":
        return <Box>It's a list bro!</Box>;
      case "OPTION":
        return <Switch />;
      case "TEXT":
      default:
        return (
          <Input
            // placeholder={default_val}
            value={value}
            onChange={(e) => sendState(name, e.target.value)}
          />
        );
    }
  };

  return inputSwitch();
};

export default TheParam;
