import { Toggle } from "utils/atoms/toggles/Toggle";

export function SwitchInputConfig() {
  return null;
}

export function SwitchInput({
  value,
  defaultVal,
  onChange,
  isDisabled,
  className,
}) {
  const valueBool = value === "true";

  return (
    <div className="flex justify-end">
      <Toggle
        checked={valueBool}
        disabled={isDisabled}
        onCheckedChange={onChange}
        twRootClasses={`SwitchRoot ${className}`}
        twThumbClasses="SwitchThumb"
      />
    </div>
  );
}
