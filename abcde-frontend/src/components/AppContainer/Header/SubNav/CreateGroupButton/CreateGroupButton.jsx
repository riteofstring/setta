import { Button } from "@chakra-ui/react";

export default function CreateGroupButton() {
  return (
    <Button
      // leftIcon={<Icon as={AiOutlineGroup} />}
      size="xs"
      mr="-px"
      variant="ghost"
    >
      Create Deck
    </Button>
  );
}
