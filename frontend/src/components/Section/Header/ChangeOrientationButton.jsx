import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { AiOutlineRotateRight } from "react-icons/ai";
import { toggleSectionOrientation } from "state/actions/sectionInfos";

export function ChangeOrientationButton({ sectionId }) {
  //   const isHorizontalOrientation = useSectionInfos(
  //     (x) => x.x[sectionId].isHorizontalOrientation,
  //   );

  function onClick() {
    toggleSectionOrientation(sectionId);
  }

  return (
    <IconButton
      icon={<AiOutlineRotateRight />}
      color="text-setta-600 hover:text-orange-500 dark:hover:text-orange-700"
      bg="bg-transparent justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      onClick={onClick}
    />
  );
}
