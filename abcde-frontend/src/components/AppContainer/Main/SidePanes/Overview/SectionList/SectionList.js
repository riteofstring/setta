import SectionItem from "./SectionItem/SectionItem";

export default function SectionList({ listOfSectionNames }) {
  return (
    <>
      {listOfSectionNames.map((e, idx) => (
        <SectionItem sectionName={e} key={`${e}-${idx}`}/>
      ))}
    </>
  );
}
