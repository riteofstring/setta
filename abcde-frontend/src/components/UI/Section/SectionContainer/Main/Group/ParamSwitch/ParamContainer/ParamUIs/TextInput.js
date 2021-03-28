import { Input } from "@chakra-ui/react";

export default function TextInput({value, defaultVal, sendState}) {
  return (
    <Input
      type=""
      variant="flushed"
      placeholder={defaultVal}
      size="xs"
      maxWidth="10rem"
      value={value}
      onChange={(e) => sendState(e.target.value)}
    />
  );
}
