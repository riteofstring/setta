import { Input } from "@chakra-ui/react";


export function TextInputConfig(){
  return null;
}

export default function TextInput({ value, defaultVal, onChangeEnd, isDisabled }) {
  return (
    <Input
      type=""
      variant="flushed"
      placeholder={defaultVal}
      size="xs"
      maxWidth="10rem"
      isDisabled={isDisabled}
      value={value}
      onChange={(e) => onChangeEnd(e.target.value)}
    />
  );
}
