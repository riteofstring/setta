import _ from "lodash";
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
  const valueBool = value[0].value === "true";

  return (
    <div className="flex justify-end">
      <Toggle
        checked={valueBool}
        disabled={isDisabled}
        onCheckedChange={(v) => onChange({ type: "raw", value: _.toString(v) })}
        twRootClasses={`SwitchRoot ${className}`}
        twThumbClasses="SwitchThumb"
      />
    </div>
  );
}
