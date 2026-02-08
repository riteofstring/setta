import React from "react";
import { goToSection } from "state/actions/sections/sectionPositions";

export type OverviewListingType = { id: string; name: string; depth: number };

export function SectionListItems({
  listOfSectionIdsAndNames = [],
  checkbox = false,
}: {
  listOfSectionIdsAndNames: Array<OverviewListingType>;
  checkbox?: boolean;
}) {
  return listOfSectionIdsAndNames.map((e, idx) => (
    <SectionItem
      sectionId={e.id}
      sectionHeading={e.name}
      checkbox={checkbox}
      depth={e.depth}
      key={`SectionItem-${e.id}-${idx}`}
    />
  ));
}

function _SectionItem({
  sectionId,
  sectionHeading,
  checkbox,
  depth,
}: {
  sectionId: string;
  sectionHeading: string;
  checkbox: boolean;
  depth: number;
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
      className="cursor-pointer truncate rounded px-2 py-0.5 text-xs text-setta-700 hover:bg-white hover:shadow-md focus-visible:border-transparent focus-visible:bg-blue-500 focus-visible:text-white  focus-visible:outline-none focus-visible:ring-0 dark:text-setta-200 dark:hover:bg-setta-700 dark:focus-visible:!text-white"
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{ marginLeft: `${0.75 * depth}rem` }}
      tabIndex={0}
    >
      {sectionHeading}
    </li>
  );
}

const SectionItem = React.memo(_SectionItem);
