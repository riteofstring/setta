import { Box, HStack, Icon, useRadio } from "@chakra-ui/react";
import { BiFile, BiGitBranch } from "react-icons/bi";

export function SelectableFileListItem({ isProject, children, radioProps }) {
  const { getInputProps, getCheckboxProps, state } = useRadio(radioProps);
  const input = getInputProps();
  const checkbox = getCheckboxProps();

  // https://github.com/chakra-ui/chakra-ui/discussions/4252
  function maybeUnset() {
    if (state.isChecked && input.onChange) {
      input.onChange("");
    }
  }

  return (
    <Box as="label">
      <input {...input} onClick={maybeUnset} />

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
        <Icon as={getFileIcon(isProject)} />
        <Box>{children}</Box>
      </HStack>
    </Box>
  );
}

export function FileListItem({ isProject, children }) {
  return (
    <Box as="label">
      <HStack cursor="pointer" px={3} py={1} borderRadius="md">
        <Icon as={getFileIcon(isProject)} />
        <Box>{children}</Box>
      </HStack>
    </Box>
  );
}

function getFileIcon(isProject) {
  if (isProject) {
    return BiFile;
  } else {
    return BiGitBranch;
  }
}
