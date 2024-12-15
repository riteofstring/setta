import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { toggleSectionLock } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";

export function LockPositionButton({ sectionId }) {
  const positionAndSizeLocked = useSectionInfos(
    (x) => x.x[sectionId].positionAndSizeLocked,
  );

  const iconClassName = positionAndSizeLocked
    ? "gg-lock !scale-[.4] mt-4"
    : "gg-lock-unlock !scale-[.4]";

  function onClick() {
    toggleSectionLock(sectionId);
  }

  return (
    <IconButton
      icon={<i className={iconClassName} />}
      color={`${positionAndSizeLocked ? "dark:text-orange-500 text-orange-800 hover:!text-orange-100 dark:hover:!text-orange-100" : "text-setta-600"}  hover:text-orange-500 dark:hover:text-orange-700`}
      bg={`${positionAndSizeLocked ? "bg-orange-200 dark:bg-orange-950  hover:bg-orange-400 dark:hover:bg-orange-500" : "bg-transparent"} justify-content-center mr-1`}
      size="w-4 h-4"
      padding="p-0"
      onClick={onClick}
    />
  );
}
