import { Stack, Icon, IconButton, Spacer } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";
import SectionTitle from "./Title/SectionTitle";
import { useStoreState } from "easy-peasy";

export default function SectionHeader({ sectionId }) {
  const sectionHeading = useStoreState(
    (actions) => actions.master.sectionIdsToSectionHeadings[sectionId]
  );

  const isList = useStoreState((state) => state.master.isList[sectionId]);

  const selected = useStoreState((state) => state.master.selected[sectionId]);

  const currObjectName = selected.name;

  return (
    <Stack direction="row" w="100%">
      <SectionTitle sectionHeading={sectionHeading} currObjectName={currObjectName}/>
      <Spacer />
      {isList ? <IconButton bg="whiteAlpha" icon={<Icon as={HiX} />} /> : <></>}
    </Stack>
  );
}
