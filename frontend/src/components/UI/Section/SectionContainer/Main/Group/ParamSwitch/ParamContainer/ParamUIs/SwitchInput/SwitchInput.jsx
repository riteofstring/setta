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
  area = "card-value",
}) {
  const valueBool = value === "true";

  return (
    <div
      className={`${area} flex ${area ? "place-self-center" : "justify-end"}`}
    >
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
