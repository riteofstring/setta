import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import { loadAgentRuns } from "state/actions/ai";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImplIfPresent,
  getSectionImplChildren,
  getSectionShouldRender,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import {
  useAIStore,
  useProjectState,
  useSettings,
  ZustandProjectState,
} from "state/definitions";
import { useMatchSorterFilter } from "state/hooks/utils";
import {
  createSettingsState,
  isBaseParentSectionImpl,
  type BaseSectionImplUnion,
  type ColorPickerChoice,
  type Core,
  type ViewMode,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  getActiveSectionIdsFromRuns,
  isChatSectionWaitingForResponse,
} from "./aiActivity";
import { ProjectName } from "./ProjectName";
import {
  buildColorChoiceByColor,
  getSelectedTagFilterDisplay,
  getTagFilterOptionLabel,
  TAG_FILTER_ALL,
  TAG_FILTER_UNTAGGED,
  type TagFilterValue,
} from "./ProjectOverview.utils";
import { OverviewListingType, SectionListItems } from "./SectionListItems";

const DEFAULT_SECTION_TAG_COLOR_CHOICES: ColorPickerChoice[] =
  createSettingsState().gui.sectionTagColorChoices;

export function ProjectOverview() {
  const sectionList = useOverviewListing();
  const activeSectionIds = useActiveAgentSectionIds();
  return (
    <ProjectOverviewCore
      sectionList={sectionList}
      activeSectionIds={activeSectionIds}
    />
  );
}

function ProjectOverviewCore({
  sectionList,
  activeSectionIds,
}: {
  sectionList: Array<OverviewListingType>;
  activeSectionIds: ReadonlySet<string>;
}) {
  const [filteredList, setFilter] = useMatchSorterFilter(sectionList, ["name"]);
  const sectionTagColorChoices =
    useSettings((x) => x.gui.sectionTagColorChoices, _.isEqual) ||
    DEFAULT_SECTION_TAG_COLOR_CHOICES;

  const [tagFilter, setTagFilter] = useState<TagFilterValue>(TAG_FILTER_ALL);

  const tagFilteredList = useMemo(() => {
    if (tagFilter === TAG_FILTER_ALL) {
      return filteredList;
    }
    if (tagFilter === TAG_FILTER_UNTAGGED) {
      return filteredList.filter((x) => x.tagColor === null);
    }
    return filteredList.filter((x) => x.tagColor === tagFilter);
  }, [filteredList, tagFilter]);

  return (
    <>
      <ProjectName />
      <search className="nodrag mx-[2px] flex min-w-0 flex-col gap-2 pb-4 dark:text-setta-200">
        <div className="relative flex min-w-0 items-center">
          <div className="absolute left-0 grid select-none place-items-center pl-1">
            <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
          </div>
          <input
            className="min-w-0 flex-grow cursor-auto truncate border-solid border-setta-200 bg-transparent py-1 pl-5 text-sm placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:!border-blue-300 dark:border-setta-800 dark:placeholder-setta-700"
            placeholder="Filter"
            {...getFloatingBoxHandlers({
              content: "Search through your project's cards.",
            })}
            tabIndex={0}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="select-none text-[11px] font-bold uppercase tracking-wide text-setta-500 dark:text-setta-500">
            Tag
          </p>
          <TagFilterDropdown
            colorChoices={sectionTagColorChoices}
            value={tagFilter}
            onChange={setTagFilter}
          />
        </div>
      </search>
      <div className="setta-pane-scroll min-h-0 flex-grow">
        <ul
          className="min-h-0 flex-grow"
          {...getFloatingBoxHandlers({
            content: "Click on a section name to pan to it.",
          })}
        >
          <SectionListItems
            listOfSectionIdsAndNames={tagFilteredList}
            activeSectionIds={activeSectionIds}
          />
        </ul>
      </div>
    </>
  );
}

function TagFilterDropdown({
  colorChoices,
  value,
  onChange,
}: {
  colorChoices: ColorPickerChoice[];
  value: TagFilterValue;
  onChange: (nextValue: TagFilterValue) => void;
}) {
  const choiceByColor = useMemo(
    () => buildColorChoiceByColor(colorChoices),
    [colorChoices],
  );
  const selectedDisplay = getSelectedTagFilterDisplay(value, choiceByColor);
  const [isOpen, setIsOpen] = useState(false);
  const triggerClassName =
    "flex items-center gap-2 rounded-md border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";
  const menuContentClassName =
    "z-50 flex flex-col rounded bg-white p-2 shadow-md dark:bg-setta-850";
  const menuItemClassName =
    "flex cursor-pointer items-center rounded px-2 py-1 hover:bg-setta-100 dark:hover:bg-setta-700";
  const menuItemTextClassName =
    "max-w-48 truncate text-xs text-setta-700 dark:text-setta-200";
  const closeWithValue = (nextValue: TagFilterValue) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  return (
    <StandardPopover
      open={isOpen}
      onOpenChange={setIsOpen}
      contentClasses={menuContentClassName}
      contentProps={{
        align: "end",
        sideOffset: 6,
      }}
      trigger={
        <button
          type="button"
          aria-label="Tag filter"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={triggerClassName}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ${selectedDisplay.dotRingClassName}`}
            style={{ backgroundColor: selectedDisplay.dotColor }}
            aria-hidden="true"
          />
          <span className="max-w-28 truncate">{selectedDisplay.label}</span>
          <i
            className="gg-chevron-down !scale-75 opacity-70"
            aria-hidden="true"
          />
        </button>
      }
    >
      <div
        role="listbox"
        aria-label="Available tag filters"
        className="flex flex-col"
      >
        <button
          type="button"
          role="option"
          aria-selected={value === TAG_FILTER_ALL}
          className={`${menuItemClassName} ${menuItemTextClassName}`}
          onClick={() => closeWithValue(TAG_FILTER_ALL)}
        >
          All
        </button>
        <button
          type="button"
          role="option"
          aria-selected={value === TAG_FILTER_UNTAGGED}
          className={`${menuItemClassName} ${menuItemTextClassName}`}
          onClick={() => closeWithValue(TAG_FILTER_UNTAGGED)}
        >
          Untagged
        </button>
        <div className="my-1 h-px bg-setta-200/80 dark:bg-setta-700/60" />

        {colorChoices.map((item, index) => (
          <button
            key={index}
            type="button"
            role="option"
            aria-selected={value === item.color}
            className={menuItemClassName}
            onClick={() => closeWithValue(item.color)}
          >
            <span
              className="mr-2 h-4 w-4 rounded-full ring-1 ring-black/10 dark:ring-white/10"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            ></span>
            <span className={menuItemTextClassName}>
              {getTagFilterOptionLabel(item)}
            </span>
          </button>
        ))}
      </div>
    </StandardPopover>
  );
}

export function useOverviewListing() {
  return useProjectState((projectState) => {
    const outputList: Array<OverviewListingType> = [];
    const viewMode = getActiveViewModeConfig(projectState);
    const { isEditingViewMode } = projectState.projectConfig;
    const topLevelSectionIds = getTopLevelSectionIdsForDisplay(projectState);
    const listingContext = {
      isEditingViewMode,
      outputList,
      projectState,
      viewMode,
    };
    for (const sectionId of topLevelSectionIds) {
      const sectionImpl = getCurrEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      const sectionCore = projectState.sections[sectionId];
      if (!sectionImpl || !sectionCore) {
        continue;
      }
      getDepthListingHelper(sectionCore, sectionImpl, 0, listingContext);
    }
    return outputList;
  }, _.isEqual);
}

function useActiveAgentSectionIds(): ReadonlySet<string> {
  const { agentRuns, agentRunsInitialLoadComplete } = useAIStore(
    (state) => ({
      agentRuns: state.agentRuns,
      agentRunsInitialLoadComplete: state.agentRunsInitialLoadComplete,
    }),
    shallow,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);

  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);

  const activeSectionIds = useMemo(
    () => getActiveSectionIdsFromRuns(agentRuns, projectConfigId),
    [agentRuns, projectConfigId],
  );

  return activeSectionIds;
}

function getDepthListingHelper(
  section: Core,
  sectionImpl: BaseSectionImplUnion,
  depth: number,
  context: {
    isEditingViewMode: boolean;
    outputList: Array<OverviewListingType>;
    projectState: ZustandProjectState;
    viewMode: ViewMode;
  },
) {
  const visibility = context.viewMode.visibilityBySectionId[section.id];
  if (visibility === undefined) {
    return;
  }
  const shouldRender = getSectionShouldRender(
    visibility,
    context.isEditingViewMode,
  );
  if (!shouldRender) {
    return;
  }
  context.outputList.push({
    id: section.id,
    name: section.name,
    depth: depth,
    tagColor: sectionImpl.tagColor ?? null,
    aiWorking: isChatSectionWaitingForResponse(sectionImpl),
  });

  if (isBaseParentSectionImpl(sectionImpl)) {
    for (const childId of getSectionImplChildren(sectionImpl)) {
      const childSection = context.projectState.sections[childId];
      if (!childSection) {
        continue;
      }
      const childSectionImpl = getCurrEffectiveSectionImplIfPresent(
        context.projectState,
        childId,
      );
      if (!childSectionImpl) {
        continue;
      }
      getDepthListingHelper(childSection, childSectionImpl, depth + 1, context);
    }
  }
}
