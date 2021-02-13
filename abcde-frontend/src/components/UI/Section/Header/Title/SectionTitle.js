import { Stack, Heading } from "@chakra-ui/react";

export default function SectionTitle() {
  return (
    <Stack mb="0.5rem">
      <Heading
        size="md"
        fontWeight="medium"
        letterSpacing="tighter"
        color="gray.500"
        as="h2"
      >
        Generative Adversarial Network Optimizer
      </Heading>
      <Heading size="sm" fontWeight="light" as="h3">
        GlobalEmbeddingSpaceTester
      </Heading>
    </Stack>
  );
}
