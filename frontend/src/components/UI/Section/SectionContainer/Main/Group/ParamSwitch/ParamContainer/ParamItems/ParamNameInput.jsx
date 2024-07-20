import { useEffect, useState } from "react";
import { StandardInput } from "utils/atoms/input/StandardInput";

export function ParamNameInput({ value, onBlur, hasChildren, onClick }) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ?? "");
  }, [value]);

  return (
    <StandardInput
      placeholder="Please Enter Key"
      twClasses={`min-w-0 placeholder:text-runcoder-300 dark:placeholder:text-runcoder-600 h-[calc(100%_-_1px)] truncate ${hasChildren ? "card-value-full" : "card-key"} row-span-1 dark:focus-visible:border-blue-400 font-mono`}
      value={liveValue}
      onChange={(v) => setLiveValue(v.target.value)}
      onBlur={(v) => onBlur(v.target.value)}
      onClick={onClick}
    />
  );
}
