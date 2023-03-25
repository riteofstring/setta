import { SectionItem } from "./SectionItem/SectionItem";

export function SectionListItems({ listOfSectionIdsAndNames = [] }) {
  return listOfSectionIdsAndNames.map((e, idx) => (
    <div
      style={{ paddingLeft: `${0.75 * e.depth}rem` }}
      key={`SectionItem-${e.sectionId}-${idx}`}
    >
      <SectionItem sectionId={e.sectionId} sectionHeading={e.sectionHeading} />
    </div>
  ));
}
