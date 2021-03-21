import { Stack, Spacer, Select } from "@chakra-ui/react";
import SectionTitle from "./Title/SectionTitle";
import { useStoreState } from "easy-peasy";
import Incrementer from "../Incrementer/Incrementer";

export default function SectionHeader({
  sectionId,
  parentId,
  nextId,
  isList,
  isListRoot,
}) {
  const sectionHeading = useStoreState(
    (actions) => actions.master.sectionIdsToSectionHeadings[sectionId]
  );

  const currPage = useStoreState((state) => state.master.currPage);
  const currObjectName = useStoreState((state) => state.master.idHierarchy[currPage][sectionId].objName);

  return (
    <Stack direction="row" align="center" w="100%">
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

      {isList && (
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
