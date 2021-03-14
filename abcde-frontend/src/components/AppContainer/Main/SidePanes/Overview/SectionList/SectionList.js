import SectionItem from "./SectionItem/SectionItem";

export default function SectionList({ listOfSectionIdsAndNames }) {
  return (
    <>
      {listOfSectionIdsAndNames.map((e, idx) => (
        <SectionItem
          sectionHeading={e.sectionHeading}
          isList={e.isList}
          key={`${e.sectionId}-${idx}`}
        />
      ))}
    </>
  );
}
