import { IconButton } from "@chakra-ui/react";

import { AiFillPushpin } from "react-icons/ai";

export default function PinButton() {
  return (
    <IconButton
      bg="whiteAlpha"
      size="xs"
      cursor="pointer"
      icon={<AiFillPushpin />}
      color="gray.300"
    />
  );
}
