import * as Switch from "@radix-ui/react-switch";
import "./styles.css";

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
    <Switch.Root
      className={`${className} SwitchRoot`}
      checked={value}
      disabled={isDisabled}
      onCheckedChange={onBlur}
    >
      <Switch.Thumb className="SwitchThumb" />
    </Switch.Root>
  );
}
