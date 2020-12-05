import React from "react";
import { HStack, Button, Input, useNumberInput } from "@chakra-ui/react";

const NestedIncrementer = () => {
  const {
    getInputProps,
    getIncrementButtonProps,
    getDecrementButtonProps,
  } = useNumberInput({
    step: 1,
    defaultValue: 1,
    min: 1,
  });

  const inc = getIncrementButtonProps();
  const dec = getDecrementButtonProps();
  const input = getInputProps({ isReadOnly: true });

  return (
    <HStack maxW="10rem">
      <Input {...input} />
      <Button {...dec}>-</Button>
      <Button {...inc}>+</Button>
    </HStack>
  );
};

export default React.memo(NestedIncrementer);
