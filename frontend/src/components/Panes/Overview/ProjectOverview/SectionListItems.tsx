import React from "react";
import { goToSection } from "state/actions/sections/sectionPositions";

export type OverviewListingType = {
  id: string;
  name: string;
  depth: number;
  tagColor: string | null;
  aiWorking: boolean;
};

export function SectionListItems({
  listOfSectionIdsAndNames = [],
  checkbox = false,
  activeSectionIds,
}: {
  listOfSectionIdsAndNames: Array<OverviewListingType>;
  checkbox?: boolean;
  activeSectionIds?: ReadonlySet<string>;
}) {
  return listOfSectionIdsAndNames.map((e, idx) => (
    <SectionItem
      sectionId={e.id}
      sectionHeading={e.name}
      checkbox={checkbox}
      depth={e.depth}
      tagColor={e.tagColor}
      isAIWorking={Boolean(e.aiWorking || activeSectionIds?.has(e.id))}
      key={`SectionItem-${e.id}-${idx}`}
    />
  ));
}

function _SectionItem({
  sectionId,
  sectionHeading,
  checkbox,
  depth,
  tagColor,
  isAIWorking,
}: {
  sectionId: string;
  sectionHeading: string;
  checkbox: boolean;
  depth: number;
  tagColor: string | null;
  isAIWorking: boolean;
}) {
  const handleSelection = () => {
    goToSection(sectionId);
  };

  const onClick = (e: React.MouseEvent) => {
    handleSelection();
    // focusOnSection(e, sectionId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      handleSelection();
      // focusOnSection(e, sectionId);
    }
  };

  if (checkbox) {
    return (
      <label
        className="dark:text-rx-300 flex cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-setta-700 hover:bg-white hover:shadow-md dark:text-setta-200  dark:hover:bg-setta-700"
        // onClick={onClick}
      >
        <input
          type="checkbox"
          className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
        />
        {sectionHeading}
      </label>
    );
  }

  return (
    <li
      id={`${sectionId}-OverviewListItem`}
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-0.5 text-xs text-setta-700 hover:bg-white hover:shadow-md focus-visible:border-transparent focus-visible:bg-blue-500 focus-visible:text-white focus-visible:outline-none focus-visible:ring-0 dark:text-setta-200 dark:hover:bg-setta-700 dark:focus-visible:!text-white"
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{ marginLeft: `${0.75 * depth}rem` }}
      tabIndex={0}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
        style={{
          backgroundColor: tagColor ?? "transparent",
          opacity: tagColor ? 1 : 0,
        }}
        title={tagColor ? `Color tag: ${tagColor}` : undefined}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{sectionHeading}</span>
      {isAIWorking ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700 dark:bg-blue-400/20 dark:text-blue-200"
          aria-label="AI working on this section"
          data-testid={`overview-ai-working-${sectionId}`}
        >
          <i className="gg-spinner !scale-[0.55]" aria-hidden="true" />
          AI
        </span>
      ) : null}
    </li>
  );
}

const SectionItem = React.memo(_SectionItem);
