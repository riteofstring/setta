import { Toggle } from "components/Utils/atoms/toggles/Toggle";

export function SwitchInputConfig() {
  return null;
}

export function SwitchInput({
  value,
  defaultVal,
  onChange,
  isDisabled,
  outerDivClassName,
  twRootClasses,
  twThumbClasses,
}) {
  const valueBool = typeof value === "string" ? value === "true" : value;

  return (
    <div className={outerDivClassName}>
      <Toggle
        checked={valueBool}
        disabled={isDisabled}
        onCheckedChange={onChange}
        twRootClasses={twRootClasses}
        twThumbClasses={twThumbClasses}
      />
    </div>
  );
}
