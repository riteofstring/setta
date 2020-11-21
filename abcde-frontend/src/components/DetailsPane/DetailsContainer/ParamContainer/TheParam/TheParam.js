import React, { useState } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
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

const TheParam = ({ name, parameters }) => {
  const { ui_type, default_val } = parameters;

  const { setGlobalCurrParams } = useStoreActions((actions) => actions.master);

  const [value, setValue] = useState("");

  const sendState = (name, value) => {
    setGlobalCurrParams({ name, value });
  };

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
            placeholder={default_val}
            onChange={(e) => setValue(e.target.value)}
          />
        );
    }
  };

  return (
    <OutsideClickHandler
      onOutsideClick={() => {
        sendState(name, value);
      }}
    >
      {inputSwitch()}
    </OutsideClickHandler>
  );
};

export default TheParam;
