import { StandardInput } from "utils/atoms/input/StandardInput";

export function TextInputConfig() {
  return null;
}

export function TextInput({
  value,
  defaultVal,
  onChange,
  onBlur,
  isDisabled,
  className,
}) {
  const _className = className + " border-b border-gray-700 text-xs";

  return (
    <StandardInput
      placeholder={defaultVal}
      disabled={isDisabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
    />
  );
}
