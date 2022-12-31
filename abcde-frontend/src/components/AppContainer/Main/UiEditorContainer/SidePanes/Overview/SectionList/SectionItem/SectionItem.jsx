import { useGoToSection } from "hooks/useGetSectionPosition";
import { OVERVIEW } from "utils/constants";

export default function SectionItem({ sectionId, sectionHeading }) {
  const goToSection = useGoToSection(sectionId, OVERVIEW);

  const onClick = () => {
    goToSection();
  };

  return (
    <p
      className="py-0.5 px-3 rounded text-gray-500 cursor-pointer hover:bg-white hover:shadow-sm hover:border-white"
      onClick={onClick}
      data-testid={`Overview Listing ${sectionId}`}
    >
      {sectionHeading}
    </p>
  );
}
