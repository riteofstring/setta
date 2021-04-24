import { HStack, Heading, Input } from "@chakra-ui/react";

export default function SectionTitle({ sectionHeading }) {
  // temp_
  const tempBool = false;
  return (
    <>
      {tempBool ? (
        <Input placeholder="Please Enter Key" />
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
