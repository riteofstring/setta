import React from "react";
import { goToSection } from "thunks/goToSection";

function _SectionItem({ sectionId, sectionHeading }) {
  const onClick = () => {
    goToSection(sectionId);
  };

  return (
    <p
      className="dark:text-rx-300 cursor-pointer truncate rounded px-3 py-0.5 text-sm text-runcoder-700 hover:bg-white hover:shadow-md dark:text-runcoder-200  dark:hover:bg-runcoder-700"
      onClick={onClick}
      data-testid={`Overview Listing ${sectionId}`}
    >
      {sectionHeading}
    </p>
  );
}

export const SectionItem = React.memo(_SectionItem);
