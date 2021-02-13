import { Stack, Icon, IconButton, Spacer } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";
import SectionTitle from "./Title/SectionTitle";
import { useStoreState } from "easy-peasy";

export default function SectionHeader({ theSection, sectionId, isListRoot = false }) {
  const sectionHeading = useStoreState(
    (actions) => actions.master.sectionIdsToSectionHeadings[sectionId]
  );

  const selected = useStoreState((state) => state.master.selected[sectionId]);

  const currObjectName = selected.name;

  return (
    <Stack direction="row" w="100%">
      <SectionTitle sectionHeading={sectionHeading} currObjectName={currObjectName}/>
      <Spacer />
      <IconButton bg="whiteAlpha" icon={<Icon as={HiX} />} />
    </Stack>
  );
}
