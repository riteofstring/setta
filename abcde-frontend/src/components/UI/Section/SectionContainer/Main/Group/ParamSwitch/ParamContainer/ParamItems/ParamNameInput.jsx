import { useEffect, useState } from "react";

export default function ParamNameInput({ value, onBlur }) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ? value : "");
  }, [value]);

  return (
    <input
      placeholder="Please Enter Key"
      value={liveValue}
      onChange={(v) => setLiveValue(v.target.value)}
      onBlur={(v) => onBlur(v.target.value)}
      className="nodrag w-1/2 bg-white text-xs"
    />
  );
}
