import { Switch } from "@chakra-ui/react";

export function SwitchInputConfig() {
  return null;
}

export default function SwitchInput({
  value,
  defaultVal,
  onChangeEnd,
  isDisabled,
  className,
}) {
  return (
    // <Tooltip isDisabled={isDisabled} hasArrow label="Label Tooltip Placeholder">
    <Switch
      isChecked={value}
      isDisabled={isDisabled}
      onChange={(e) => onChangeEnd(e.target.checked)}
      size="sm"
      className={className}
    />
    // </Tooltip>
  );
}
