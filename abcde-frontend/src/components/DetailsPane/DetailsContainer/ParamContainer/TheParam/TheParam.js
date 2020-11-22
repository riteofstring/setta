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
  const { name, type, ui_type, default_val } = parameters;

  const { setGlobalCurr: setGlobalCurrParams } = useStoreActions(
    (actions) => actions.globalCurrParams
  );

  const { addNestedSection } = useStoreActions((actions) => actions.master);

  const { globalCurr: globalCurrParams } = useStoreState(
    (state) => state.globalCurrParams
  );
  const { currName: currObjName } = useStoreState(
    (state) => state.globalCurrObj
  );

  const [value, setValue] = useState(default_val);

  const sendState = (name, value) => {
    setValue(value);
    setGlobalCurrParams({ name, value });
  };

  useEffect(() => {
    setValue(globalCurrParams[name] ? globalCurrParams[name] : default_val);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters, currObjName]);

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
      case "NESTED_OBJECT":
      // Value for nested object has to be obtained here somehow
      // addNestedSection(type)
      case "LIST":
        return <Box>Nested Function</Box>;
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
