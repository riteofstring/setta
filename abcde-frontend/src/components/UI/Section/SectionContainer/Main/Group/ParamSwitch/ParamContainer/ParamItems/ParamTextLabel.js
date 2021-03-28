import { Text, FormLabel } from "@chakra-ui/react";

export default function ParamTextLabel(props) {
  const name = props ? props.parameters.name : "";

  return (
    <FormLabel>
      <Text fontSize="sm" fontWeight="semibold" color="gray.700">
        {name}
      </Text>
    </FormLabel>
  );
}
