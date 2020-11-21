import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import {
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Switch,
} from "@chakra-ui/react";
import OutsideClickHandler from "react-outside-click-handler";

const TheParam = ({ parameters }) => {
  const { name, ui_type, default_val } = parameters;

  const { setGlobalCurrParams } = useStoreActions(
    (actions) => actions.globalCurrParams
  );

  const { globalCurrParams } = useStoreState((state) => state.globalCurrParams);
  const { currObjName } = useStoreState((state) => state.globalCurrObj);

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
      case "LIST":
        return (
          <Select placeholder="Select option">
            <option value="option1">Option 1</option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </Select>
        );
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
  // <OutsideClickHandler
  //   onOutsideClick={() => {
  //     sendState(name, value);
  //   }}
  // >
  //   {inputSwitch()}
  // </OutsideClickHandler>
  // {}
  // );
};

export default TheParam;
