import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplIfPresent,
  getEmbeddedAttachedTerminalForCodeSection,
} from "state/actions/sectionInfos";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type ListRootViewMode,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { SectionContainer } from "./SectionContainer";

type NestedSectionViewState = {
  readonly childIds: readonly string[];
  readonly isHorizontalOrientation: boolean;
  readonly listRootViewMode: ListRootViewMode | null;
};

export function MaybeManyNestedSections({
  sectionId,
  isGroup,
  layoutVariant = "default",
}: {
  sectionId: string;
  isGroup: boolean;
  layoutVariant?: "default" | "tight";
}) {
  const { childIds, isHorizontalOrientation, listRootViewMode } =
    useProjectState(
      (state) => getNestedSectionViewState(state, sectionId),
      shallow,
    );

  if (childIds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
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
    </div>
  );
}

function getNestedSectionViewState(
  state: ZustandProjectState,
  sectionId: string,
): NestedSectionViewState {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const childIds = getRenderableNestedSectionChildIds(state, sectionId);
  if (impl.type === SectionTypeEnum.Group) {
    return {
      childIds,
      isHorizontalOrientation: impl.isHorizontalOrientation,
      listRootViewMode: null,
    };
  }
  if (impl.type === SectionTypeEnum.ListRoot) {
    return {
      childIds,
      isHorizontalOrientation: impl.viewMode === ListRootViewModeEnum.kanban,
      listRootViewMode: impl.viewMode,
    };
  }
  return {
    childIds,
    isHorizontalOrientation: false,
    listRootViewMode: null,
  };
}

function getRenderableNestedSectionChildIds(
  state: ZustandProjectState,
  sectionId: string,
): string[] {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseParentSectionImpl(impl)) {
    return [];
  }
  const childIds = impl.children.filter((childId) =>
    getCurrEffectiveSectionImplIfPresent(state, childId),
  );
  const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
    state,
    sectionId,
    childIds,
  );
  if (!embeddedTerminal?.isTerminalMinimized) {
    return childIds;
  }
  return childIds.filter(
    (childId) => childId !== embeddedTerminal.attachedTerminalId,
  );
}

function NestedSectionsTight({ childIds }: { childIds: readonly string[] }) {
  return (
    <div className="flex w-full flex-col">
      {childIds.map((e) => (
        <NestedSectionContainer
          sectionId={e}
          key={`Nested-Sec-${e}`}
          className="w-full"
        />
      ))}
    </div>
  );
}

function NestedSectionsWithMargin({
  childIds,
  sectionId,
  isGroup,
  isHorizontalOrientation,
  listRootViewMode,
}: {
  childIds: readonly string[];
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
          <NestedSectionContainer
            sectionId={e}
            key={`Nested-Sec-${e}`}
            className={childClassName}
          />
        ))}
      </div>
    </div>
  );
}

function NestedSectionContainer({
  sectionId,
  className,
}: {
  sectionId: string;
  className?: string | undefined;
}) {
  return (
    <div
      className={`relative flex w-full outline-none ${className ?? ""}`}
      data-nested-section-id={sectionId}
      tabIndex={-1}
    >
      <SectionContainer sectionId={sectionId} isTopLevel={false} />
    </div>
  );
}
