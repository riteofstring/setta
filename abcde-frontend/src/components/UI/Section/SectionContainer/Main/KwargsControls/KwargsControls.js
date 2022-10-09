import { AddIcon, MinusIcon } from "@chakra-ui/icons";
import { Heading, HStack, IconButton, Stack } from "@chakra-ui/react";
import { useAddKwarg } from "hooks/useKwarg";

export default function KwargsControls({ sectionId, objInfoId }) {
  const addKwarg = useAddKwarg(sectionId, objInfoId);
  return (
    <Stack>
      <HStack pt="1rem" pl=".75rem">
        <Heading
          as="h2"
          color="gray.400"
          size="sm"
          fontWeight="700"
          // pr="0.1rem"
        >
          kwargs
        </Heading>
        <KwargsButton icon={<MinusIcon w={2} />} />
        <KwargsButton icon={<AddIcon w={2} />} onClick={addKwarg} />
      </HStack>
    </Stack>
  );
}

function KwargsButton({ icon, onClick }) {
  return (
    <IconButton
      icon={icon}
      size="xs"
      variant="ghost"
      borderRadius="full"
      onClick={onClick}
      className="nodrag"
      position="inherit"
      ml="0.1rem !important"
    />
  );
}
