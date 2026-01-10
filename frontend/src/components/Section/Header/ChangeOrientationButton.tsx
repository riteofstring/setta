import {
  TbArrowBigDownLinesFilled,
  TbArrowBigRightLinesFilled,
} from "react-icons/tb";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities, useShareSectionAccess } from "state/hooks/share";
import { route_toggle_group_orientation } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type ChangeOrientationButtonProps = {
  sectionId: string;
};

export function ChangeOrientationButton({
  sectionId,
}: ChangeOrientationButtonProps) {
  const isHorizontalOrientation = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.type === SectionTypeEnum.Group && impl.isHorizontalOrientation;
  });
  const { canEditLayout } = useShareCapabilities();
  const canEditSection = useShareSectionAccess(sectionId);
  const isDisabled = !canEditLayout || !canEditSection;

  function onClick() {
    if (isDisabled) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (impl.type !== SectionTypeEnum.Group) {
          return;
        }
        setCurrEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
          isHorizontalOrientation: !impl.isHorizontalOrientation,
        });
      },
      send: (frontendOpId) =>
        route_toggle_group_orientation({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          frontendOpId,
        }),
    });
  }

  return (
    <button
      className="nodrag justify-content-center mr-1 flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-400 hover:text-setta-500 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-600 dark:hover:text-setta-400"
      onClick={onClick}
      disabled={isDisabled}
    >
      {!isHorizontalOrientation ? (
        <TbArrowBigDownLinesFilled />
      ) : (
        <TbArrowBigRightLinesFilled />
      )}
    </button>
  );
}
