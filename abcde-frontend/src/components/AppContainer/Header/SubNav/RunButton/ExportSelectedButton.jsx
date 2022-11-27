import { Button } from "@chakra-ui/react";

export default function ExportSelectedButton({ buttonText }) {
  return (
    <>
      <Button
        size="xs"
        mr="-px"
        onClick={convertAndOpen}
        variant="ghost"
        colorScheme="blue"
      >
        {buttonText}
      </Button>
    </>
  );
}
