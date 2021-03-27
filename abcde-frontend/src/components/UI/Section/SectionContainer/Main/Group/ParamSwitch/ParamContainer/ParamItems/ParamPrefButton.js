import { IconButton } from "@chakra-ui/react";
import { HiDotsHorizontal } from "react-icons/hi";

export default function ParamPrefButton(props) {
  return (
    <IconButton
      icon={<HiDotsHorizontal />}
      borderRadius="full"
      variant="ghost"
      size="xs"
      color="gray.400"
    />
  );
}
