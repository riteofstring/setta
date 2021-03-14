import SectionListItems from "./SectionListItems";
import PageAccordion from "./PageAccordion";

const tempArray = [0, 1, 2];

export default function SectionList({ listOfSectionIdsAndNames }) {
  return (
    <>
      {tempArray.length > 1 ? (
        <PageAccordion>
          <SectionListItems
            listOfSectionIdsAndNames={listOfSectionIdsAndNames}
          />
        </PageAccordion>
      ) : (
        <SectionListItems listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
      )}
    </>
  );
}
