import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { Heading, HStack, IconButton, Stack } from "@chakra-ui/react";
import { useAddKwarg } from "hooks/useKwarg";

export default function KwargsControls({ sectionId, objInfoId }) {
  const addKwarg = useAddKwarg(sectionId, objInfoId);
  return (
    <Stack>
      <HStack pt="1rem" pl=".75rem">
        <Heading as="h2" color="gray.400" size="sm" fontWeight="700">
          kwargs
        </Heading>
        <IconButton
          icon={<AddIcon w={2} />}
          size="xs"
          variant="ghost"
          borderRadius="full"
          onClick={addKwarg}
          className="nodrag"
          position="inherit"
        />
        <IconButton
          icon={<MinusIcon w={2} />}
          size="xs"
          variant="ghost"
          borderRadius="full"
          // onClick={addKwarg}
          className="nodrag"
          position="inherit"
          ml="0.1rem !important"
        />
      </HStack>
    </Stack>
  );
}
