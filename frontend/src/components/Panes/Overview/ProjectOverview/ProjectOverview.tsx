import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getSectionCore,
  getSectionShouldRender,
} from "state/actions/sectionInfos";
import { useProjectState, ZustandProjectState } from "state/definitions";
import { useMatchSorterFilter } from "state/hooks/utils";
import {
  isBaseParentSectionImpl,
  type BaseSectionImplUnion,
  type Core,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { ProjectName } from "./ProjectName";
import { OverviewListingType, SectionListItems } from "./SectionListItems";
import { WatchCodeSettings } from "./WatchCodeSettings";

export function ProjectOverview() {
  const sectionList = useOverviewListing();
  return <ProjectOverviewCore sectionList={sectionList} />;
}

function ProjectOverviewCore({
  sectionList,
}: {
  sectionList: Array<OverviewListingType>;
}) {
  const [filteredList, setFilter] = useMatchSorterFilter(sectionList, ["name"]);

  return (
    <>
      <ProjectName />
      <WatchCodeSettings />
      <search className="nodrag relative mx-[2px] flex min-w-0 items-center pb-4 dark:text-setta-200">
        <div className="absolute left-0 grid select-none place-items-center pl-1">
          <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
        </div>
        <input
          className="min-w-0 flex-grow cursor-auto truncate border-solid border-setta-200 bg-transparent py-1 pl-5  text-sm placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:!border-blue-300 dark:border-setta-800 dark:placeholder-setta-700"
          placeholder="Filter"
          {...getFloatingBoxHandlers({
            content: "Search through your project's cards.",
          })}
          tabIndex={0}
          onChange={(e) => setFilter(e.target.value)}
        />
      </search>
      <div className="min-h-0 flex-grow overflow-y-scroll">
        <ul
          className="min-h-0 flex-grow"
          {...getFloatingBoxHandlers({
            content: "Click on a section name to pan to it.",
          })}
        >
          <SectionListItems listOfSectionIdsAndNames={filteredList} />
        </ul>
      </div>
    </>
  );
}

export function useOverviewListing() {
  return useProjectState((x) => {
    const outputList: Array<OverviewListingType> = [];
    const viewMode = getActiveViewModeConfig(x);
    const { isEditingViewMode } = x.projectConfig;
    for (const sectionId of Object.keys(x.projectConfig.topLevelSections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      const sectionCore = getSectionCore(x, sectionId);
      getDepthListingHelper(
        sectionCore,
        sectionImpl,
        0,
        x,
        viewMode,
        isEditingViewMode,
        outputList,
      );
    }
    return outputList;
  }, _.isEqual);
}

function getDepthListingHelper(
  section: Core,
  sectionImpl: BaseSectionImplUnion,
  depth: number,
  x: ZustandProjectState,
  viewMode: ViewModeConfig,
  isEditingViewMode: boolean,
  outputList: Array<OverviewListingType>,
) {
  const visibility = viewMode.visibilityBySectionId[section.id];
  if (visibility === undefined) {
    throw new Error(
      `Missing visibility for section ${section.id} in view mode ${viewMode.id}`,
    );
  }
  const shouldRender = getSectionShouldRender(visibility, isEditingViewMode);
  if (!shouldRender) {
    return;
  }
  outputList.push({
    id: section.id,
    name: section.name,
    depth: depth,
  });

  if (isBaseParentSectionImpl(sectionImpl)) {
    for (const childId of sectionImpl.children) {
      const childSection = x.sections[childId];
      const childSectionImpl = getCurrEffectiveSectionImpl(x, childId);
      if (childSection) {
        getDepthListingHelper(
          childSection,
          childSectionImpl,
          depth + 1,
          x,
          viewMode,
          isEditingViewMode,
          outputList,
        );
      }
    }
  }
}
