import { Button, Icon } from "@chakra-ui/react";
import { AiOutlineGroup } from "react-icons/ai";

export default function CreateGroupButton() {
  return (
    <Button
      leftIcon={<Icon as={AiOutlineGroup} />}
      size="xs"
      mr="-px"
      variant="ghost"
    >
      Create Deck
    </Button>
  );
}
