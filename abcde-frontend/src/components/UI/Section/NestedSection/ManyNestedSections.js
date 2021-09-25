import { DNDSortable } from "../../../../utils/DNDSortable/DNDSortable";
import NestedSection from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  childSectionInfo,
  available,
  parentControls,
  depth,
  isCollapsed,
  setIdsOverview,
  setIdNames,
  setChildren,
}) {
  const isList = Object.values(childSectionInfo)[0].isList;

  const getNestedSections = () => {
    return childIds.map((e, idx) => (
      <NestedSection
        parentId={sectionId}
        sectionId={e}
        nextId={childIds[idx + 1]}
        sectionInfo={childSectionInfo[e]}
        available={available}
        parentControls={parentControls}
        idx={idx}
        key={`Nested-Sec-${e}`}
        depth={depth + 1}
        isCollapsed={isCollapsed}
        setIdsOverview={setIdsOverview}
        setIdNames={setIdNames}
      />
    ));
  };

  return isList ? (
    <DNDSortable items={childIds} setItems={setChildren}>
      {getNestedSections()}
    </DNDSortable>
  ) : (
    getNestedSections()
  );
}
