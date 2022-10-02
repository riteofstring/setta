import { Button } from "@chakra-ui/react";

export default function CreateSectionButton() {
  return (
    <Button
      // leftIcon={<Icon as={BsCardHeading} />}
      size="xs"
      mr="-px"
      variant="ghost"
    >
      New Card
    </Button>
  );
}
