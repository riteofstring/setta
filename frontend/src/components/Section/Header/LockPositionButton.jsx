import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { toggleSectionLock } from "state/actions/sectionInfo";
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
      color="text-setta-600 hover:text-orange-500 dark:hover:text-orange-700"
      bg="bg-transparent justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      onClick={onClick}
    />
  );
}
