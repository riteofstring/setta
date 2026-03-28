import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { DNDSortable } from "forks/dnd-kit/DNDSortable";
import {
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { ListRootViewModeEnum, SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  ManyNestedSectionsBody,
  type ManyNestedSectionsRenderer,
} from "./ManyNestedSectionsBody";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import type { ManyNestedSectionsRendererProps } from "./manyNestedSectionsView";
import { SortableSectionContainer } from "./SortableSectionContainer";
import { useHasTempNested } from "./utils";

const renderSectionContainerCoreBody: SectionContainerCoreBodyRenderer = (
  props,
) => <SectionContainerCoreCanvasBody {...props} />;

const renderSortableNestedSections: ManyNestedSectionsRenderer = ({
  childIds,
  childClassName,
}: ManyNestedSectionsRendererProps) =>
  childIds.map((childId) => (
    <SortableSectionContainer
      sectionId={childId}
      key={`Nested-Sec-${childId}`}
      className={childClassName}
      renderCoreBody={renderSectionContainerCoreBody}
    />
  ));

export function MaybeManyNestedSections({
  sectionId,
  isGroup,
  layoutVariant = "default",
}: {
  sectionId: string;
  isGroup: boolean;
  layoutVariant?: "default" | "tight";
}) {
  const hasNested = useHasTempNested(sectionId);
  return (
    hasNested && (
      <div className="flex flex-col">
        <ManyNestedSections
          sectionId={sectionId}
          isGroup={isGroup}
          layoutVariant={layoutVariant}
        />
      </div>
    )
  );
}

function ManyNestedSections({
  sectionId,
  isGroup,
  layoutVariant,
}: {
  sectionId: string;
  isGroup: boolean;
  layoutVariant: "default" | "tight";
}) {
  const tempChildIds = useDndChildren((x) => x.x[sectionId] ?? []);
  const { isHorizontalOrientation, listRootViewMode } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    if (impl.type === SectionTypeEnum.Group) {
      return {
        isHorizontalOrientation: impl.isHorizontalOrientation,
        listRootViewMode: null,
      };
    }
    if (impl.type === SectionTypeEnum.ListRoot) {
      return {
        isHorizontalOrientation: impl.viewMode === ListRootViewModeEnum.kanban,
        listRootViewMode: impl.viewMode,
      };
    }
    return {
      isHorizontalOrientation: false,
      listRootViewMode: null,
    };
  }, shallow);
  const hiddenAttachedTerminalId = useProjectState((x) => {
    const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
      x,
      sectionId,
      tempChildIds,
    );
    if (!embeddedTerminal || !embeddedTerminal.isTerminalMinimized) {
      return null;
    }
    return embeddedTerminal.attachedTerminalId;
  });
  const childIds = hiddenAttachedTerminalId
    ? tempChildIds.filter((id) => id !== hiddenAttachedTerminalId)
    : tempChildIds;

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      <ManyNestedSectionsBody
        childIds={childIds}
        sectionId={sectionId}
        isGroup={isGroup}
        isHorizontalOrientation={isHorizontalOrientation}
        listRootViewMode={listRootViewMode}
        layoutVariant={layoutVariant}
        renderNestedSections={renderSortableNestedSections}
      />
    </DNDSortable>
  );
}
