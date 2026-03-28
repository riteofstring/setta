import {
  ListRootViewModeEnum,
  type ListRootViewMode,
} from "utils/generatedTypes";

export type ManyNestedSectionsBodyProps = {
  childIds: string[];
  sectionId: string;
  isGroup: boolean;
  isHorizontalOrientation: boolean;
  listRootViewMode: ListRootViewMode | null;
  layoutVariant: "default" | "tight";
};

type TightManyNestedSectionsView = {
  kind: "tight";
  childIds: string[];
  containerClassName: string;
  childClassName: string;
};

type StandardManyNestedSectionsView = {
  kind: "standard";
  childIds: string[];
  containerClassName: string;
  childClassName?: string;
  showNavigationRail: boolean;
  navigationRailClassName: string;
};

export type ManyNestedSectionsView =
  | TightManyNestedSectionsView
  | StandardManyNestedSectionsView;

const NAVIGATION_RAIL_CLASS_NAME =
  "mr-2 mt-2 min-h-full w-2 rounded-full bg-white/30 transition-all duration-75 hover:cursor-pointer hover:bg-white/50 dark:bg-setta-700 hover:dark:bg-setta-600";

export function buildManyNestedSectionsView({
  childIds,
  isGroup,
  isHorizontalOrientation,
  listRootViewMode,
  layoutVariant,
}: ManyNestedSectionsBodyProps): ManyNestedSectionsView {
  if (layoutVariant === "tight") {
    return {
      kind: "tight",
      childIds,
      containerClassName: "flex w-full flex-col",
      childClassName: "w-full",
    };
  }

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

  return {
    kind: "standard",
    childIds,
    containerClassName,
    childClassName,
    showNavigationRail: !isGroup && !isKanbanView,
    navigationRailClassName: NAVIGATION_RAIL_CLASS_NAME,
  };
}
