import React from "react";
import {
  Input,
  FormControl,
  FormLabel,
  Stack,
  HStack,
  Flex,
  Switch,
  Heading,
} from "@chakra-ui/react";

const TextInput = React.forwardRef((props, ref) => {
  return (
    <FormControl>
      <Stack>
        <FormLabel color="gray.300" fontSize="sm" htmlFor={props.id} mb="0rem">
          {props.label}
        </FormLabel>
        <Input size="sm" ref={ref} id={props.id} {...props} />
      </Stack>
    </FormControl>
  );
});

export default function ParamSweepPopover({ firstFieldRef, onCancel }) {
  return (
    <Flex direction="column">
      <Heading as="h4" fontSize="md" color="gray.500">
        Parameter Sweep
      </Heading>
      <HStack mt="1rem" mb="1.5rem">
        <TextInput
          label="From"
          id="ParamSweepFrom"
          ref={firstFieldRef}
          defaultValue="1"
        />
        <TextInput label="To" id="ParamSweepTo" defaultValue="5" />
        <TextInput label="Step" id="ParamSweepStep" defaultValue="1" />
      </HStack>

      <FormControl width="100%" display="flex" alignItems="center">
        <FormLabel
          fontSize="sm"
          fontWeight="semibold"
          color="gray.400"
          mr="0.5rem"
          htmlFor="reveal-group"
          mb="0"
        >
          Enable
        </FormLabel>
        <Switch size="sm" id="reveal-group" />
      </FormControl>
    </Flex>
  );
}
