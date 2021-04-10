import { Stack, Spacer, Select } from "@chakra-ui/react";
import SectionTitle from "./Title/SectionTitle";
import { useStoreState } from "easy-peasy";
import Incrementer from "../Incrementer/Incrementer";

export function SectionHeader({
  sectionId,
  parentId,
  nextId,
  isList,
  isListRoot,
}) {
  const { objName } = useStoreState((state) =>
    state.master.sections.getSelected(sectionId)
  );
  const sectionHeading = useStoreState((state) =>
    state.master.sections.getSectionHeading(sectionId)
  );

  return (
    <Stack direction="row" align="center" w="100%">
      {isList && (
        <Select placeholder="List" size="sm" w="auto">
          <option value="option1">List</option>
          <option value="option2">Dictionary</option>
        </Select>
      )}
      <SectionTitle sectionHeading={sectionHeading} currObjectName={objName} />

      {(isList || isListRoot) && (
        <>
          <Spacer />
          <Incrementer
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            isListRoot={isListRoot}
          />
        </>
      )}
    </Stack>
  );
}
