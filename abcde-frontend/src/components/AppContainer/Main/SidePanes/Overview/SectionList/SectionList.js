import SectionItem from "./SectionItem/SectionItem";
import { Stack } from "@chakra-ui/react";

export default function SectionList({ listOfSectionIdsAndNames }) {
  return (
    <>
      {listOfSectionIdsAndNames.map((e, idx) => (
        <Stack pl={`${.5*e.depth}rem`}>
          <SectionItem
            sectionHeading={e.sectionHeading}
            isList={e.isList}
            isListRoot={e.isListRoot}
            key={`${e.sectionId}-${idx}`}
          />
        </Stack>
      ))}
    </>
  );
}
