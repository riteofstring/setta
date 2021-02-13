import { Stack, Icon, IconButton, Spacer } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";
import SectionTitle from "./Title/SectionTitle";

export default function SectionHeader() {
  return (
    <Stack direction="row" w="100%">
      <SectionTitle />
      <Spacer />
      <IconButton bg="whiteAlpha" icon={<Icon as={HiX} />} />
    </Stack>
  );
}
