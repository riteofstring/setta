import { Text, FormLabel, Tooltip } from "@chakra-ui/react";

export default function ParamTextLabel(props) {
  // temp_
  const tempBool = true;
  return (
    <FormLabel>
      <Tooltip isDisabled={tempBool} hasArrow label="Label Tooltip Placeholder">
        <Text fontSize="sm" fontWeight="semibold" color="gray.700">
          {props.paramName}
        </Text>
      </Tooltip>
    </FormLabel>
  );
}
