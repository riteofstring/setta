import { Switch } from "@chakra-ui/react";

export function SwitchInputConfig() {
  return null;
}

export default function SwitchInput({
  value,
  defaultVal,
  onChangeEnd,
  isDisabled,
}) {
  return (
    // <Tooltip isDisabled={isDisabled} hasArrow label="Label Tooltip Placeholder">
    <Switch
      isDisabled={isDisabled}
      onChange={(e) => onChangeEnd(e.target.checked)}
    />
    // </Tooltip>
  );
}
