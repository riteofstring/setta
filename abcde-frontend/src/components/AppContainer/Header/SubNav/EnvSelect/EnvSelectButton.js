import { Button, Icon } from "@chakra-ui/react";
import { BiCube } from "react-icons/bi";

export default function EnvSelectButton() {
  return (
    <Button variant="ghost" leftIcon={<Icon as={BiCube} />} size="xs" mr="-px">
      Environment
    </Button>
  );
}
