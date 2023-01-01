import { useGoToSection } from "hooks/useGetSectionPosition";
import { INDICATOR_GOTO_PARENT } from "utils/constants";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export default function ManyNestedSections({
  childIds,
  sectionId,
  depth,
  isDeck,
}) {
  const goToSection = useGoToSection(sectionId, INDICATOR_GOTO_PARENT);

  const onClick = () => {
    goToSection();
  };

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      <div className="flex items-stretch">
        {!isDeck && (
          <div
            className="w-[12px] mt-2 mr-2 bg-white opacity-[.16] rounded-full min-h-full hover:opacity-[.36] hover:cursor-pointer z-[200]"
            onClick={onClick}
          />
        )}
        <div className="items-start [&:not(first-child):mt-2]">
          {childIds.map((e, idx) => (
            <SortableSectionContainer
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    </DNDSortable>
  );
}
