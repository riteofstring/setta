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

  const iconSize = isGroup
    ? positionAndSizeLocked
      ? "[&>i]:!-mt-[6px]" // when isGroup && positionAndSizeLocked
      : "[&>i]:!scale-50 [&>i]:!-mt-[9px]" // when isGroup && !positionAndSizeLocked
    : "[&>i]:!scale-[.4]"; // when !isGroup

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
    <button
      className={`focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer flex justify-center ${
        positionAndSizeLocked
          ? "shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] dark:shadow-none dark:border-transparent  dark:bg-transparent  hover:bg-orange-500 dark:hover:bg-orange-500"
          : "bg-transparent"
      } ${iconSize} ${
        positionAndSizeLocked
          ? "dark:text-orange-500 text-orange-600 hover:!text-orange-100 dark:hover:!text-orange-100"
          : isGroup
            ? "text-setta-400 dark:text-setta-600"
            : "text-setta-600"
      } hover:text-orange-500 dark:hover:text-orange-700 rounded-full p-0 mr-1 ${
        isGroup ? "w-5 h-5" : "w-4 h-4"
      }`}
      onClick={onClick}
    >
      <i className={iconClassName} />
    </button>
  );
}
