import React from "react";
import { goToSection } from "state/actions/goToSection";

function _SectionItem({ sectionId, sectionHeading, checkbox }) {
  const onClick = () => {
    goToSection(sectionId);
  };

  if (checkbox) {
    return (
      <label
        className="dark:text-rx-300 flex cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-setta-700 hover:bg-white hover:shadow-md dark:text-setta-200  dark:hover:bg-setta-700"
        // onClick={onClick}
        data-testid={`Overview Listing ${sectionId}`}
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
    <p
      className="dark:text-rx-300 cursor-pointer truncate rounded px-1 py-0.5 text-sm text-setta-700 hover:bg-white hover:shadow-md dark:text-setta-200  dark:hover:bg-setta-700"
      onClick={onClick}
      data-testid={`Overview Listing ${sectionId}`}
    >
      {sectionHeading}
    </p>
  );
}

export const SectionItem = React.memo(_SectionItem);
