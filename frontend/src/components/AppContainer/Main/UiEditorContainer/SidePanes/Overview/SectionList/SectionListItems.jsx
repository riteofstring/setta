import { SectionItem } from "./SectionItem/SectionItem";

export function SectionListItems({
  listOfSectionIdsAndNames = [],
  checkbox = false,
}) {
  return listOfSectionIdsAndNames.map((e, idx) => (
    <li
      // className="-mx-3"
      style={{ paddingLeft: `${0.75 * e.depth}rem` }}
      key={`SectionItem-${e.id}-${idx}`}
    >
      <SectionItem
        sectionId={e.id}
        sectionHeading={e.name}
        checkbox={checkbox}
      />
    </li>
  ));
}
