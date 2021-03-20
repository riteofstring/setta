import SectionListItems from "./SectionListItems";
import PageAccordion from "./PageAccordion";

export default function SectionList({ listOfSectionIdsAndNames }) {
  return (
    <>
      {listOfSectionIdsAndNames.length > 1 ? (
        listOfSectionIdsAndNames.map((e, idx) => (
          <PageAccordion pageNum={idx + 1}>
            <SectionListItems listOfSectionIdsAndNames={e} />
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
