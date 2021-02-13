import { HStack, Input, useNumberInput, IconButton } from "@chakra-ui/react";
import { AddIcon, MinusIcon } from "@chakra-ui/icons";

export default function Incrementer() {
  const {
    getInputProps,
    getIncrementButtonProps,
    getDecrementButtonProps,
  } = useNumberInput({
    step: 1,
    defaultValue: 1,
    min: 0,
    precision: 0,
  });

  const inc = getIncrementButtonProps();
  const dec = getDecrementButtonProps();
  const input = getInputProps({ isReadOnly: false });
  return (
    <HStack maxW="320px">
      <IconButton icon={<MinusIcon />} size="xs" {...dec} />
      <Input size="sm" {...input} maxW="5ch" />
      <IconButton icon={<AddIcon />} size="xs" {...inc} />
    </HStack>
  );
}
