import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { DNDSortable } from "forks/dnd-kit/DNDSortable";
import {
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
} from "state/actions/sectionInfos";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectState } from "state/definitions";
import {
  ListRootViewMode,
  ListRootViewModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { SortableSectionContainer } from "./SortableSectionContainer";
import { useHasTempNested } from "./utils";

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
  if (!hasNested) {
    return null;
  }

  return (
    <ManyNestedSections
      sectionId={sectionId}
      isGroup={isGroup}
      layoutVariant={layoutVariant}
    />
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
      {layoutVariant === "tight" ? (
        <NestedSectionsTight childIds={childIds} />
      ) : (
        <NestedSectionsWithMargin
          childIds={childIds}
          sectionId={sectionId}
          isGroup={isGroup}
          isHorizontalOrientation={isHorizontalOrientation}
          listRootViewMode={listRootViewMode}
        />
      )}
    </DNDSortable>
  );
}

function NestedSectionsTight({ childIds }: { childIds: string[] }) {
  return (
    <>
      {childIds.map((e) => (
        <SortableSectionContainer
          sectionId={e}
          key={`Nested-Sec-${e}`}
          className="w-full"
        />
      ))}
    </>
  );
}

function NestedSectionsWithMargin({
  childIds,
  sectionId,
  isGroup,
  isHorizontalOrientation,
  listRootViewMode,
}: {
  childIds: string[];
  sectionId: string;
  isGroup: boolean;
  isHorizontalOrientation: boolean;
  listRootViewMode: ListRootViewMode | null;
}) {
  const onClick = () => {
    goToSection(sectionId);
  };
  const isKanbanView = listRootViewMode === ListRootViewModeEnum.kanban;
  const isTaskListView = listRootViewMode === ListRootViewModeEnum.task_list;
  let childClassName: string | undefined;
  if (isKanbanView) {
    childClassName = "w-full min-w-[18rem] max-w-[24rem]";
  } else if (isTaskListView) {
    childClassName = "w-full";
  }

  let containerClassName = "mt-2 flex flex-col items-start gap-2";
  if (isHorizontalOrientation) {
    if (isKanbanView) {
      containerClassName =
        "mt-2 flex flex-row items-start gap-3 overflow-x-auto pb-2 pr-2";
    } else {
      containerClassName = "mt-2 flex flex-row items-start gap-2";
    }
  } else if (isTaskListView) {
    containerClassName = "mt-1 flex flex-col items-start gap-1";
  }

  return (
    <div className="flex items-stretch">
      {!isGroup && !isKanbanView && (
        <div
          className={`mr-2 mt-2 min-h-full w-2 rounded-full bg-white/30 transition-all duration-75 hover:cursor-pointer hover:bg-white/50 dark:bg-setta-700 hover:dark:bg-setta-600`}
          onClick={onClick}
        />
      )}
      <div className={containerClassName}>
        {childIds.map((e) => (
          <SortableSectionContainer
            sectionId={e}
            key={`Nested-Sec-${e}`}
            className={childClassName}
          />
        ))}
      </div>
    </div>
  );
}
