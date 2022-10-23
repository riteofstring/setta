import { Button, Icon } from "@chakra-ui/react";
import { BiHistory } from "react-icons/bi";

export default function ClearHistoryButton() {
  return (
    <Button
      leftIcon={<Icon as={BiHistory} />}
      size="xs"
      mr="-px"
      variant="ghost"
    >
      Clear History
    </Button>
  );
}
