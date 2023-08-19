import { SectionItem } from "./SectionItem/SectionItem";

export function SectionListItems({ listOfSectionIdsAndNames = [] }) {
  return listOfSectionIdsAndNames.map((e, idx) => (
    <li
      style={{ paddingLeft: `${0.75 * e.depth}rem` }}
      key={`SectionItem-${e.id}-${idx}`}
    >
      <SectionItem sectionId={e.id} sectionHeading={e.name} />
    </li>
  ));
}
