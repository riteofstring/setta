import { useGoToSection } from "hooks/useGetSectionPosition";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export function ManyNestedSections({
  childIds,
  sectionId,
  ancestorSet,
  isDeck,
}) {
  const goToSection = useGoToSection(sectionId);

  const onClick = () => {
    goToSection();
  };

  const newAncestorSet = { ...ancestorSet, [sectionId]: true };

  return (
    <DNDSortable
      sectionId={sectionId}
      items={childIds}
      ancestorSet={newAncestorSet}
    >
      <div className="flex items-stretch">
        {!isDeck && (
          <div
            className="mt-2 mr-2 min-h-full w-[12px] rounded-full bg-white opacity-[.16] hover:opacity-[.36]"
            onClick={onClick}
          />
        )}
        <div className="flex flex-col items-start gap-2 ">
          {childIds.map((e, idx) => (
            <SortableSectionContainer
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              ancestorSet={newAncestorSet}
            />
          ))}
        </div>
      </div>
    </DNDSortable>
  );
}
