import { Button, Icon } from "@chakra-ui/react";
import { BiTerminal } from "react-icons/bi";

export default function TerminalButton() {
  return (
    <Button
      variant="ghost"
      leftIcon={<Icon as={BiTerminal} />}
      size="sm"
      mr="-px"
    >
      Terminal
    </Button>
  );
}
