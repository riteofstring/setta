import _ from "lodash";
import type { ReactNode } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_toggle_position_locks } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type LockPositionButtonRenderState = {
  isGroup: boolean;
  positionAndSizeLocked: boolean;
  iconClassName: string;
  onClick: () => void;
};

type LockPositionButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
  render?: (state: LockPositionButtonRenderState) => ReactNode;
};

export function LockPositionButton({
  sectionId,
  hasSectionStyleTheme = false,
  render,
}: LockPositionButtonProps) {
  const { isGroup, positionAndSizeLocked } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      isGroup: impl.type === SectionTypeEnum.Group,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    };
  }, _.isEqual);
  const { canEditLayout } = useShareCapabilities();

  const iconClassName = positionAndSizeLocked ? "gg-lock" : "gg-lock-unlock";

  let iconSize = "[&>i]:!scale-[.4]"; // when !isGroup
  if (isGroup) {
    if (positionAndSizeLocked) {
      iconSize = "[&>i]:!-mt-[6px]"; // when isGroup && positionAndSizeLocked
    } else {
      iconSize = "[&>i]:!scale-50 [&>i]:!-mt-[9px]"; // when isGroup && !positionAndSizeLocked
    }
  }

  function onClick() {
    if (!canEditLayout) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        setCurrEffectiveSectionImplValue(state, sectionId, {
          positionAndSizeLocked: !impl.positionAndSizeLocked,
        });
      },
      send: (frontendOpId) =>
        route_toggle_position_locks({
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: [sectionId],
          frontendOpId,
        }),
    });
  }

  if (render) {
    return render({
      isGroup,
      positionAndSizeLocked,
      iconClassName,
      onClick,
    });
  }

  let backgroundClassName = "bg-transparent";
  let textClassName = "text-setta-600";
  if (hasSectionStyleTheme) {
    if (positionAndSizeLocked) {
      backgroundClassName = "bg-[color:var(--setta-section-style-bg)]";
      textClassName = "text-[color:var(--setta-section-style-outline)]";
    } else {
      backgroundClassName =
        "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]";
      textClassName =
        "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)]";
    }
  } else if (positionAndSizeLocked) {
    backgroundClassName =
      "shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] hover:bg-orange-500 dark:border-transparent  dark:bg-transparent  dark:shadow-none dark:hover:bg-orange-500";
    textClassName =
      "text-orange-600 hover:!text-orange-100 dark:text-orange-500 dark:hover:!text-orange-100";
  } else if (isGroup) {
    textClassName = "text-setta-400 dark:text-setta-600";
  }

  return (
    <button
      className={`nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2 ${
        hasSectionStyleTheme
          ? "focus-visible:ring-[var(--setta-section-style-outline)]"
          : ""
      } ${backgroundClassName} ${iconSize} ${textClassName} mr-1 rounded-full p-0 ${
        hasSectionStyleTheme
          ? ""
          : "hover:text-orange-500 dark:hover:text-orange-700"
      } ${
        isGroup ? "h-5 w-5" : "h-4 w-4"
      } ${canEditLayout ? "" : "cursor-not-allowed opacity-50"}`}
      onClick={onClick}
      disabled={!canEditLayout}
    >
      <i className={iconClassName} />
    </button>
  );
}
