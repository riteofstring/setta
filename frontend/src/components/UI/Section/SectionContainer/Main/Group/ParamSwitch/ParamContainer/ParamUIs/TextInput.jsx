import { StandardInput } from "utils/atoms/input/StandardInput";

export function TextInputConfig() {
  return null;
}

export function TextInput({
  value,
  defaultVal,
  onChange,
  isDisabled,
  className,
}) {
  const _className = className + " border-b border-slate-700 text-xs";

  return (
    <StandardInput
      placeholder={defaultVal}
      disabled={isDisabled}
      value={value[0].value}
      onChange={(e) => onChange(0, "raw", e.target.value)}
    />
  );
}
