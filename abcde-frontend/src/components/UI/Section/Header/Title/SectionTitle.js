import { Stack, Heading } from "@chakra-ui/react";

export default function SectionTitle({ sectionHeading, currObjName }) {
  return (
    <Stack mb="0.5rem">
      <Heading
        size="md"
        fontWeight="medium"
        letterSpacing="tighter"
        color="gray.500"
        as="h2"
      >
        {sectionHeading}
      </Heading>
      <Heading size="sm" fontWeight="light" as="h3">
        {currObjName}
      </Heading>
    </Stack>
  );
}
