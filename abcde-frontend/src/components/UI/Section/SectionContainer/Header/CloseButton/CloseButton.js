import { CloseIcon } from "@chakra-ui/icons";
import { IconButton } from "@chakra-ui/react";

export default function CloseButton() {
  return (
    <IconButton
      aria-label="Close section"
      icon={<CloseIcon />}
      borderRadius="full"
      variant="ghost"
      size="xs"
      colorScheme="gray"
    />
  );
}
