import { useGoToSection } from "hooks/useGetSectionPosition";
import React from "react";

function _SectionItem({ sectionId, sectionHeading }) {
  const goToSection = useGoToSection(sectionId);

  const onClick = () => {
    goToSection();
  };

  return (
    <p
      className="py-0.5 px-3 rounded text-gray-500 cursor-pointer hover:bg-white hover:shadow-md"
      onClick={onClick}
      data-testid={`Overview Listing ${sectionId}`}
    >
      {sectionHeading}
    </p>
  );
}

export const SectionItem = React.memo(_SectionItem);
