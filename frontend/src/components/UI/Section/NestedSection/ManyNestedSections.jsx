import { goToSection } from "thunks/goToSection";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

export function ManyNestedSections({ sectionId, isDeck }) {
  const tempChildIds = useDndChildren((x) => x.x[sectionId]);

  return (
    <DNDSortable sectionId={sectionId} items={tempChildIds}>
      <NestedSectionsWithMargin
        childIds={tempChildIds}
        sectionId={sectionId}
        isDeck={isDeck}
      />
    </DNDSortable>
  );
}

// disabled is passed in by DNDSortable
function NestedSectionsWithMargin({ childIds, sectionId, isDeck }) {
  const onClick = () => {
    goToSection(sectionId);
  };

  return (
    <div className="flex items-stretch">
      {!isDeck && (
        <div
          className={`mt-2 min-h-full w-[12px] rounded-full bg-white opacity-[.16] transition-all duration-75 hover:cursor-pointer hover:opacity-[.36] dark:bg-runcoder-700`}
          onClick={onClick}
        />
      )}
      <div className="flex flex-col items-start gap-2 ">
        {childIds.map((e) => (
          <SortableSectionContainer sectionId={e} key={`Nested-Sec-${e}`} />
        ))}
      </div>
    </div>
  );
}
