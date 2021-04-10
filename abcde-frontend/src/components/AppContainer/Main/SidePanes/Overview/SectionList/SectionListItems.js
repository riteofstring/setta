import SectionItem from "./SectionItem/SectionItem";
import { Stack } from "@chakra-ui/react";

export default function SectionListItems({ listOfSectionIdsAndNames, pageNum }) {
  return (
    <>
      {listOfSectionIdsAndNames &&
        listOfSectionIdsAndNames.map((e, idx) => (
          <Stack pl={`${0.5 * e.depth}rem`} key={`SectionItem-${e.sectionId}-${idx}`}>
            <SectionItem
              sectionId={e.sectionId}
              sectionHeading={e.sectionHeading}
              isList={e.isList}
              pageNum={pageNum}
            />
          </Stack>
        ))}
    </>
  );
}
