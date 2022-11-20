import { Switch } from "@chakra-ui/react";

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
    // <Tooltip isDisabled={isDisabled} hasArrow label="Label Tooltip Placeholder">
    <Switch
      isChecked={value}
      isDisabled={isDisabled}
      onChange={(e) => onBlur(e.target.checked)}
      size="sm"
      className={className}
    />
    // </Tooltip>
  );
}
