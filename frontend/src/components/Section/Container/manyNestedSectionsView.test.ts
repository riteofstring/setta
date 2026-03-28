import { ListRootViewModeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildManyNestedSectionsView } from "./manyNestedSectionsView";

describe("buildManyNestedSectionsView", () => {
  it("keeps the tight nested layout as a full-width vertical stack", () => {
    expect(
      buildManyNestedSectionsView({
        childIds: ["section-a", "section-b"],
        sectionId: "parent",
        isGroup: false,
        isHorizontalOrientation: false,
        listRootViewMode: null,
        layoutVariant: "tight",
      }),
    ).toEqual({
      kind: "tight",
      childIds: ["section-a", "section-b"],
      containerClassName: "flex w-full flex-col",
      childClassName: "w-full",
    });
  });

  it("builds the kanban horizontal layout without the navigation rail", () => {
    expect(
      buildManyNestedSectionsView({
        childIds: ["section-a"],
        sectionId: "parent",
        isGroup: false,
        isHorizontalOrientation: true,
        listRootViewMode: ListRootViewModeEnum.kanban,
        layoutVariant: "default",
      }),
    ).toEqual({
      kind: "standard",
      childIds: ["section-a"],
      containerClassName:
        "mt-2 flex flex-row items-start gap-3 overflow-x-auto pb-2 pr-2",
      childClassName: "w-full min-w-[18rem] max-w-[24rem]",
      showNavigationRail: false,
      navigationRailClassName:
        "mr-2 mt-2 min-h-full w-2 rounded-full bg-white/30 transition-all duration-75 hover:cursor-pointer hover:bg-white/50 dark:bg-setta-700 hover:dark:bg-setta-600",
    });
  });

  it("keeps task-list sections on the compact vertical layout while preserving the navigation rail", () => {
    expect(
      buildManyNestedSectionsView({
        childIds: ["section-a"],
        sectionId: "parent",
        isGroup: false,
        isHorizontalOrientation: false,
        listRootViewMode: ListRootViewModeEnum.task_list,
        layoutVariant: "default",
      }),
    ).toEqual({
      kind: "standard",
      childIds: ["section-a"],
      containerClassName: "mt-1 flex flex-col items-start gap-1",
      childClassName: "w-full",
      showNavigationRail: true,
      navigationRailClassName:
        "mr-2 mt-2 min-h-full w-2 rounded-full bg-white/30 transition-all duration-75 hover:cursor-pointer hover:bg-white/50 dark:bg-setta-700 hover:dark:bg-setta-600",
    });
  });

  it("suppresses the navigation rail for grouped nested sections in the default layout", () => {
    expect(
      buildManyNestedSectionsView({
        childIds: ["section-a"],
        sectionId: "parent",
        isGroup: true,
        isHorizontalOrientation: false,
        listRootViewMode: null,
        layoutVariant: "default",
      }),
    ).toMatchObject({
      kind: "standard",
      childIds: ["section-a"],
      containerClassName: "mt-2 flex flex-col items-start gap-2",
      showNavigationRail: false,
    });
  });
});
