import {
  Box,
  Flex,
  HStack,
  useRadio,
  useRadioGroup,
  Text,
  IconButton,
} from "@chakra-ui/react";
import { SmallCloseIcon, AddIcon } from "@chakra-ui/icons";

function RadioCard(props) {
  const { getInputProps, getCheckboxProps } = useRadio(props);

  const input = getInputProps();
  const checkbox = getCheckboxProps();

  return (
    <Box as="label" height="100%">
      <input {...input} />
      <Flex
        {...checkbox}
        align="center"
        cursor="pointer"
        borderX="1px"
        borderTop="1px"
        borderColor="gray.200"
        borderTopLeftRadius="lg"
        borderTopRightRadius="lg"
        color="gray.500"
        _checked={{
          bg: "gray.50",
          color: "black",
          borderColor: "gray.100",
        }}
        _focus={{
          boxShadow: "outline",
        }}
        pl={5}
        pr={2}
        height="100%"
      >
        <Text fontSize="sm">{props.children}</Text>
        <IconButton
          ml=".5rem"
          bg="whiteAlpha"
          size="sm"
          icon={<SmallCloseIcon color="gray.500" />}
        />
      </Flex>
    </Box>
  );
}

function TabNav() {
  const options = ["Style Transfer Exploration", "__eliteCoderz", "BigTech"];

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
    onChange: console.log,
  });

  const group = getRootProps();

  return (
    <HStack {...group} height="100%" spacing={1}>
      {options.map((value) => {
        const radio = getRadioProps({ value });
        return (
          <RadioCard key={value} {...radio}>
            {value}
          </RadioCard>
        );
      })}
      <Flex>
        <IconButton
          ml={0.5}
          bg="white"
          size="sm"
          icon={<AddIcon color="gray.500" />}
        />
      </Flex>
    </HStack>
  );
}

export default TabNav;
