import { HStack, Spacer, Select } from "@chakra-ui/react";
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

  const currObjectName = selected.name;

  return (
    <HStack w="100%">
      {isList && (
        <Select placeholder="List" size="sm" w="auto">
          <option value="option1">List</option>
          <option value="option2">Dictionary</option>
        </Select>
      )}
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
    </HStack>
  );
}
