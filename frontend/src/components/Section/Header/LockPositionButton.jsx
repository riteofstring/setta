import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function LockPositionButton({ sectionId }) {
  const positionAndSizeLocked = useGetSectionInfo(
    sectionId,
    "positionAndSizeLocked",
  );

  const iconClassName = positionAndSizeLocked
    ? "gg-lock !scale-[.4]"
    : "gg-lock-unlock !scale-[.4]";

  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "positionAndSizeLocked",
      value: !positionAndSizeLocked,
    });
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
