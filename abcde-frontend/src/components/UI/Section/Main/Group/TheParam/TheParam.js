import { Text, HStack, Input, Spacer, FormLabel } from "@chakra-ui/react";
import ParamSweepButton from "./ParamSweepUI/ParamSweepButton";
import PinButton from "./PinButton/PinButton";

export default function TheParam() {
  return (
    <HStack>
      <FormLabel>
        <Text fontSize="sm" fontWeight="semibold" color="gray.700">
          loss_weights
        </Text>
      </FormLabel>
      <PinButton />
      <Spacer />
      <ParamSweepButton />
      <Input
        type="groupone"
        variant="flushed"
        placeholder="12345"
        size="xs"
        maxWidth="10rem"
      />
    </HStack>
  );
}
