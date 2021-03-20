import { HStack, Box, useRadio, Icon } from "@chakra-ui/react";
import { BiFolder, BiFolderOpen, BiFile } from "react-icons/bi";

export default function ListItem(props) {
  const {isFolder, isSelected} = props
  const { getInputProps, getCheckboxProps } = useRadio(props);
  const input = getInputProps();
  const checkbox = getCheckboxProps();

  const getIcon = () => {
    if (isFolder){
      return isSelected ? BiFolderOpen : BiFolder
    }
    else{
      return BiFile
    }
  }

  return (
    <Box as="label">
      <input {...input} />

      <HStack
        {...checkbox}
        cursor="pointer"
        _checked={{
          bg: "gray.600",
          color: "white",
          borderColor: "gray.600",
        }}
        _focus={{
          boxShadow: "outline",
        }}
        px={3}
        py={1}
        borderRadius="md"
      >
        <Icon as={getIcon()} />
        <Box>{props.children}</Box>
      </HStack>
    </Box>
  );
}
