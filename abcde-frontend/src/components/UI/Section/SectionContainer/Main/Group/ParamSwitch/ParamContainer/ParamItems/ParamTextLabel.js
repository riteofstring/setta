import { Text, FormLabel } from "@chakra-ui/react";

export default function ParamTextLabel(props) {
  return (
    <FormLabel>
      <Text fontSize="sm" fontWeight="semibold" color="gray.700">
        {props.paramName}
      </Text>
    </FormLabel>
  );
}
