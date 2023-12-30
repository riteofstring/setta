import { useGoToSection } from "hooks/useGetSectionPosition";
import React from "react";

function _SectionItem({ sectionId, sectionHeading }) {
  const goToSection = useGoToSection();

  const onClick = () => {
    goToSection(sectionId);
  };

  return (
    <p
      className="dark:text-rx-300 cursor-pointer truncate rounded py-0.5 px-3 text-sm text-slate-700 hover:bg-white hover:shadow-md dark:text-runcoder-200  dark:hover:bg-runcoder-700"
      onClick={onClick}
      data-testid={`Overview Listing ${sectionId}`}
    >
      {sectionHeading}
    </p>
  );
}

export const SectionItem = React.memo(_SectionItem);
