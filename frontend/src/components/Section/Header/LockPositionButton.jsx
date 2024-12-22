import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import C from "constants/constants.json";
import _ from "lodash";
import { getSectionType, toggleSectionLock } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";

export function LockPositionButton({ sectionId }) {
  const { isGroup, positionAndSizeLocked } = useSectionInfos((x) => {
    return {
      isGroup: getSectionType(sectionId, x) === C.GROUP,
      positionAndSizeLocked: x.x[sectionId].positionAndSizeLocked,
    };
  }, _.isEqual);

  const iconClassName = positionAndSizeLocked ? "gg-lock" : "gg-lock-unlock";

  const iconSize = isGroup
    ? positionAndSizeLocked
      ? "[&>i]:!-mt-[6px]" // when isGroup && positionAndSizeLocked
      : "[&>i]:!scale-50 [&>i]:!-mt-[9px]" // when isGroup && !positionAndSizeLocked
    : "[&>i]:!scale-[.4]"; // when !isGroup

  function onClick() {
    toggleSectionLock(sectionId);
  }

  return (
    <IconButton
      icon={<i className={iconClassName} />}
      color={`${positionAndSizeLocked ? "dark:text-orange-500 text-orange-500 hover:!text-orange-100 dark:hover:!text-orange-100" : isGroup ? "text-setta-400 dark:text-setta-600" : "text-setta-600"} hover:text-orange-500 dark:hover:text-orange-700`}
      bg={`${positionAndSizeLocked ? "bg-white/50 shadow-sm dark:shadow-none dark:bg-transparent  hover:bg-orange-500 dark:hover:bg-orange-500" : "bg-transparent"} ${iconSize}`}
      size={isGroup ? "w-5 h-5" : "w-4 h-4"}
      padding="p-0 mr-1"
      onClick={onClick}
    />
  );
}
