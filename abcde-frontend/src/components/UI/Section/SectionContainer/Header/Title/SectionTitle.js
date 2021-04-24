import { HStack, Heading, Input } from "@chakra-ui/react";

export default function SectionTitle({
  sectionHeading,
  requiresKeyInput,
  onTitleInputChange,
}) {
  return (
    <>
      {requiresKeyInput ? (
        <Input
          placeholder="Please Enter Key"
          value={sectionHeading}
          width="50%"
          onChange={onTitleInputChange}
        />
      ) : (
        <Heading
          size="md"
          fontWeight="medium"
          letterSpacing="tighter"
          color="gray.500"
          as="h2"
        >
          {sectionHeading}
        </Heading>
      )}
    </>
  );
}
