import { Input, Tooltip } from "@chakra-ui/react";

export default function TextInput({ value, defaultVal, onChangeEnd }) {
  // temp_
  const tempBool = true;
  return (
    <Tooltip isDisabled={tempBool} hasArrow label="Label Tooltip Placeholder">
      <Input
        type=""
        variant="flushed"
        placeholder={defaultVal}
        size="xs"
        maxWidth="10rem"
        value={value}
        onChange={(e) => onChangeEnd(e.target.value)}
      />
    </Tooltip>
  );
}
