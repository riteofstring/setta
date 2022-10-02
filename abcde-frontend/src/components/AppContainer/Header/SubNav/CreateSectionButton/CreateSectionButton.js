import { Button, Icon } from "@chakra-ui/react";
import { BsCardHeading } from "react-icons/bs";

export default function CreateSectionButton() {
  return (
    <Button
      leftIcon={<Icon as={BsCardHeading} />}
      size="xs"
      mr="-px"
      variant="ghost"
    >
      New Card
    </Button>
  );
}
