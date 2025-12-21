import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_toggle_position_lock } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

export function LockPositionButton({ sectionId }) {
  const { isGroup, positionAndSizeLocked } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      isGroup: impl.type === SectionTypeEnum.Group,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    };
  }, _.isEqual);

  const iconClassName = positionAndSizeLocked ? "gg-lock" : "gg-lock-unlock";

  function onClick() {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const section = state.sections[sectionId];
        if (!section) {
          return;
        }
        section.positionAndSizeLocked = !section.positionAndSizeLocked;
      },
      send: (frontendOpId) =>
        route_toggle_position_lock({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          frontendOpId,
        }),
    });
  }

  return (
    <LockPositionButtonCore
      isLocked={positionAndSizeLocked}
      isGroup={isGroup}
      onClick={onClick}
      iconClassName={iconClassName}
    />
  );
}

type LockPositionButtonCoreProps = {
  isLocked: boolean;
  isGroup: boolean;
  onClick: () => void;
  iconClassName?: string;
};

function LockPositionButtonCore({
  isLocked,
  isGroup,
  onClick,
  iconClassName,
}: LockPositionButtonCoreProps) {
  const iconClass = iconClassName ?? (isLocked ? "gg-lock" : "gg-lock-unlock");
  let iconSize = "[&>i]:!scale-[.4]";
  if (isGroup) {
    iconSize = isLocked
      ? "[&>i]:!-mt-[6px]"
      : "[&>i]:!scale-50 [&>i]:!-mt-[9px]";
  }
  const bgClass = isLocked
    ? "shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] hover:bg-orange-500 dark:border-transparent  dark:bg-transparent  dark:shadow-none dark:hover:bg-orange-500"
    : "bg-transparent";
  let textClass = "text-setta-600";
  if (isLocked) {
    textClass =
      "text-orange-600 hover:!text-orange-100 dark:text-orange-500 dark:hover:!text-orange-100";
  } else if (isGroup) {
    textClass = "text-setta-400 dark:text-setta-600";
  }

  return (
    <button
      className={`nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2 ${bgClass} ${iconSize} ${textClass} mr-1 rounded-full p-0 hover:text-orange-500 dark:hover:text-orange-700 ${
        isGroup ? "h-5 w-5" : "h-4 w-4"
      }`}
      onClick={onClick}
      type="button"
    >
      <i className={iconClass} />
    </button>
  );
}
