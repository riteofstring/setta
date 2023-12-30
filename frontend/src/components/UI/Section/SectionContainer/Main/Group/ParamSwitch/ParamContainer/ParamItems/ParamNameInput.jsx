import { useEffect, useState } from "react";
import { StandardInput } from "utils/atoms/input/StandardInput";

export function ParamNameInput({ value, onBlur }) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ?? "");
  }, [value]);

  return (
    <StandardInput
      placeholder="Please Enter Key"
      twClasses="row-span-1"
      value={liveValue}
      onChange={(v) => setLiveValue(v.target.value)}
      onBlur={(v) => onBlur(v.target.value)}
    />
  );
}
