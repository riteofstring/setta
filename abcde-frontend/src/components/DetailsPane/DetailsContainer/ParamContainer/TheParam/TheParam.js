import React from "react";
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

const TheParam = ({ parameters }) => {
  const { ui_type, default_val } = parameters;

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
        return <Input placeholder={default_val} />;
    }
  };

  return <>{inputSwitch()}</>;
};

export default TheParam;
