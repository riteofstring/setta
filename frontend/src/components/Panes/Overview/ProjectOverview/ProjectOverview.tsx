import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import { loadAgentRuns } from "state/actions/ai";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImplIfPresent,
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
  type ViewModeConfig,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  getActiveSectionIdsFromRuns,
  hasRunningAgentRuns,
  isChatSectionWaitingForResponse,
} from "./aiActivity";
import { ProjectName } from "./ProjectName";
import { OverviewListingType, SectionListItems } from "./SectionListItems";

const DEFAULT_SECTION_TAG_COLOR_CHOICES: ColorPickerChoice[] =
  createSettingsState().gui.sectionTagColorChoices;

const TAG_FILTER_ALL = "__all__" as const;
const TAG_FILTER_UNTAGGED = "__untagged__" as const;

type TagFilterValue =
  | typeof TAG_FILTER_ALL
  | typeof TAG_FILTER_UNTAGGED
  | string;

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
  const choiceByColor = useMemo(() => {
    const next: Record<string, ColorPickerChoice> = {};
    for (const choice of colorChoices) {
      next[choice.color] = choice;
    }
    return next;
  }, [colorChoices]);

  const selectedChoice = value in choiceByColor ? choiceByColor[value] : null;
  const selectedLabel =
    value === TAG_FILTER_ALL
      ? "All"
      : value === TAG_FILTER_UNTAGGED
        ? "Untagged"
        : selectedChoice?.description || value;
  const selectedDotColor =
    value === TAG_FILTER_ALL
      ? "transparent"
      : value === TAG_FILTER_UNTAGGED
        ? "rgba(148, 163, 184, 0.7)"
        : selectedChoice?.color || value;
  const selectedDotRingClassName =
    value === TAG_FILTER_ALL
      ? "ring-setta-300/60 dark:ring-setta-700/60"
      : "ring-black/10 dark:ring-white/10";

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Tag filter"
        className="flex items-center gap-2 rounded-md border border-setta-200 bg-white px-2 py-1 text-xs font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850"
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ${selectedDotRingClassName}`}
          style={{ backgroundColor: selectedDotColor }}
          aria-hidden="true"
        />
        <span className="max-w-28 truncate">{selectedLabel}</span>
        <i
          className="gg-chevron-down !scale-75 opacity-70"
          aria-hidden="true"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-20 flex flex-col rounded bg-white p-2 shadow-md dark:bg-setta-850"
          align="end"
          sideOffset={6}
        >
          <DropdownMenu.Item
            className="flex cursor-pointer items-center rounded px-2 py-1 text-xs text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-700"
            onSelect={() => onChange(TAG_FILTER_ALL)}
          >
            All
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center rounded px-2 py-1 text-xs text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-700"
            onSelect={() => onChange(TAG_FILTER_UNTAGGED)}
          >
            Untagged
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-200/80 dark:bg-setta-700/60" />

          {colorChoices.map((item, index) => (
            <DropdownMenu.Item
              key={index}
              className="flex cursor-pointer items-center rounded px-2 py-1 hover:bg-setta-100 dark:hover:bg-setta-700"
              onSelect={() => onChange(item.color)}
            >
              <span
                className="mr-2 h-4 w-4 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="max-w-48 truncate text-xs text-setta-700 dark:text-setta-200">
                {item.description || item.color}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function useOverviewListing() {
  return useProjectState((x) => {
    const outputList: Array<OverviewListingType> = [];
    const viewMode = getActiveViewModeConfig(x);
    const { isEditingViewMode } = x.projectConfig;
    const topLevelSectionIds = getTopLevelSectionIdsForDisplay(x);
    for (const sectionId of topLevelSectionIds) {
      const sectionImpl = getCurrEffectiveSectionImplIfPresent(x, sectionId);
      const sectionCore = x.sections[sectionId];
      if (!sectionImpl || !sectionCore) {
        continue;
      }
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

function useActiveAgentSectionIds(): ReadonlySet<string> {
  const { agentRuns, agentRunsInitialLoadComplete } = useAIStore(
    (state) => ({
      agentRuns: state.agentRuns,
      agentRunsInitialLoadComplete: state.agentRunsInitialLoadComplete,
    }),
    shallow,
  );

  useEffect(() => {
    if (!agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete]);

  const hasRunningRuns = useMemo(
    () => hasRunningAgentRuns(agentRuns),
    [agentRuns],
  );

  useEffect(() => {
    if (!hasRunningRuns) {
      return;
    }
    const intervalId = setInterval(() => {
      void loadAgentRuns();
    }, 2500);
    return () => clearInterval(intervalId);
  }, [hasRunningRuns]);

  return useMemo(() => getActiveSectionIdsFromRuns(agentRuns), [agentRuns]);
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
    return;
  }
  const shouldRender = getSectionShouldRender(visibility, isEditingViewMode);
  if (!shouldRender) {
    return;
  }
  outputList.push({
    id: section.id,
    name: section.name,
    depth: depth,
    tagColor: sectionImpl.tagColor ?? null,
    aiWorking: isChatSectionWaitingForResponse(sectionImpl),
  });

  if (isBaseParentSectionImpl(sectionImpl)) {
    for (const childId of sectionImpl.children) {
      const childSection = x.sections[childId];
      if (!childSection) {
        continue;
      }
      const childSectionImpl = getCurrEffectiveSectionImplIfPresent(x, childId);
      if (!childSectionImpl) {
        continue;
      }
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
