import React from "react";
import {
  focusOnSection,
  goToSection,
} from "state/actions/sections/sectionPositions";

export function SectionListItems({
  listOfSectionIdsAndNames = [],
  checkbox = false,
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

function _SectionItem({ sectionId, sectionHeading, checkbox, depth }) {
  const onClick = () => {
    goToSection(sectionId);
  };

  const onKeyDown = (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      onClick();
      focusOnSection(sectionId);
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

  // The div id is used for tabbing purposes
  return (
    <li
      id={`${sectionId}-OverviewListItem`}
      className="focus-visible:ring-light-blue-500 cursor-pointer truncate rounded px-2 py-0.5 text-sm text-setta-700 hover:bg-white hover:shadow-md focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-700"
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{ marginLeft: `${0.75 * depth}rem` }}
      tabIndex="0"
    >
      {sectionHeading}
    </li>
  );
}

const SectionItem = React.memo(_SectionItem);

export function getShiftTabBackToOverviewListItem(sectionId) {
  return (e) => {
    if (e.key === "Tab") {
      if (e.shiftKey) {
        // tab back to overview
        const element = document.getElementById(
          `${sectionId}-OverviewListItem`,
        );
        // need to do setTimeout for some reason,
        // otherwise the div only briefly gets focus and then focus goes to a higher up div
        setTimeout(() => {
          element.focus({ preventScroll: true });
        }, 0);
      }
    }
  };
}
