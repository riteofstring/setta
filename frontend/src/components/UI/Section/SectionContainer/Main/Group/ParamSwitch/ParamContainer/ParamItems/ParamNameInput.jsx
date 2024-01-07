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
      twClasses="h-[calc(1.25rem-2px)] card-key row-span-1 dark:focus-visible:border-blue-400 font-mono"
      value={liveValue}
      onChange={(v) => setLiveValue(v.target.value)}
      onBlur={(v) => onBlur(v.target.value)}
    />
  );
}
