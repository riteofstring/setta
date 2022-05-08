import { Input } from "@chakra-ui/react";
import { useState, useEffect } from "react";

export default function ParamNameInput({ value, onBlur }) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ? value : "");
  }, [value]);

  return (
    <Input
      placeholder="Please Enter Key"
      value={liveValue}
      width="50%"
      onChange={(v) => setLiveValue(v.target.value)}
      onBlur={(v) => onBlur(v.target.value)}
      variant="flushed"
      size="xs"
      maxWidth="10rem"
    />
  );
}
