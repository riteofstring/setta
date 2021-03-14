import { Stack, Spacer, IconButton } from "@chakra-ui/react";
import SectionTitle from "./Title/SectionTitle";
import { useStoreState } from "easy-peasy";
import Incrementer from "../Incrementer/Incrementer";

export default function SectionHeader({
  sectionId,
  parentId,
  nextId,
  childrenIds,
  isList,
  isListRoot,
}) {
  const sectionHeading = useStoreState(
    (actions) => actions.master.sectionIdsToSectionHeadings[sectionId]
  );

  const selected = useStoreState((state) => state.master.selected[sectionId]);

  const currObjectName = selected.name

  return (
    <Stack direction="row" w="100%">
      <SectionTitle
        sectionHeading={sectionHeading}
        currObjectName={currObjectName}
      />
      <Spacer />
      {isList && (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          childrenIds={childrenIds}
          isListRoot={isListRoot}
        />
      )}
    </Stack>
  );
}
