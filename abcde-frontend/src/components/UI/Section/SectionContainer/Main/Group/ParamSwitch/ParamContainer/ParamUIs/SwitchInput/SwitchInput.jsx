import { Toggle } from "utils/atoms/toggles/Toggle";

export function SwitchInputConfig() {
  return null;
}

export function SwitchInput({
  value,
  defaultVal,
  onBlur,
  isDisabled,
  className,
}) {
  const valueBool = value === "true";

  return (
    <div className="flex justify-end">
      <Toggle
        checked={valueBool}
        disabled={isDisabled}
        onCheckedChange={onBlur}
        twRootClasses={`SwitchRoot ${className}`}
        twThumbClasses="SwitchThumb"
      />
    </div>
  );
}
