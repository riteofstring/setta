import { Input } from "@chakra-ui/react";

export default function TextInput({ value, defaultVal, onChangeEnd }) {
  return (
    <Input
      type=""
      variant="flushed"
      placeholder={defaultVal}
      size="xs"
      maxWidth="10rem"
      value={value}
      onChange={(e) => onChangeEnd(e.target.value)}
    />
  );
}
