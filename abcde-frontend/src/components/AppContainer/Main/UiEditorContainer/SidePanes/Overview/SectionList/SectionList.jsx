import PageAccordion from "./PageAccordion";
import SectionListItems from "./SectionListItems";

export default function SectionList({ listOfSectionIdsAndNames }) {
  return (
    <>
      {listOfSectionIdsAndNames.length > 1 ? (
        listOfSectionIdsAndNames.map((e, idx) => (
          <PageAccordion pageNum={idx + 1} key={`PageAccordian-${idx}`}>
            <SectionListItems
              listOfSectionIdsAndNames={e}
              key={`SectionListItems-${idx}`}
            />
          </PageAccordion>
        ))
      ) : (
        <SectionListItems
          listOfSectionIdsAndNames={listOfSectionIdsAndNames[0]}
        />
      )}
    </>
  );
}
