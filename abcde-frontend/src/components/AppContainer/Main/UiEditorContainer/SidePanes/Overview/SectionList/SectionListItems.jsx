import SectionItem from "./SectionItem/SectionItem";

export default function SectionListItems({ listOfSectionIdsAndNames = [] }) {
  return listOfSectionIdsAndNames.map((e, idx) => (
    <div
      style={{ paddingLeft: `${0.5 * e.depth}rem` }}
      key={`SectionItem-${e.sectionId}-${idx}`}
    >
      <SectionItem sectionId={e.sectionId} sectionHeading={e.sectionHeading} />
    </div>
  ));
}
