import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { useDisableSortable } from "forks/dnd-kit/useDndUtils";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export function DNDSortable({
  sectionId,
  items,
  children,
}: {
  sectionId: string;
  items: Array<string>;
  children: React.ReactNode;
}) {
  const disabled = useDisableSortable(sectionId);
  const isHorizontalOrientation = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (impl.type !== SectionTypeEnum.Group) {
      return false;
    }
    return impl.isHorizontalOrientation;
  });

  return (
    <SortableContext
      id={sectionId}
      items={items}
      strategy={
        isHorizontalOrientation
          ? horizontalListSortingStrategy
          : verticalListSortingStrategy
      }
      disabled={disabled}
    >
      {children}
    </SortableContext>
  );
}
