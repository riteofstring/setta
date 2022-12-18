import Toggle from "utils/atoms/toggles/Toggle";

export function SwitchInputConfig() {
  return null;
}

export default function SwitchInput({
  value,
  defaultVal,
  onBlur,
  isDisabled,
  className,
}) {
  return (
    <Toggle
      checked={value}
      disabled={isDisabled}
      onCheckedChange={onBlur}
      twRootClasses={`SwitchRoot ${className}`}
      twThumbClasses="SwitchThumb"
    />
  );
}
