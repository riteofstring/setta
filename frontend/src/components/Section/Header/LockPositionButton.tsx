import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { togglePositionLocks } from "openapi/http";
import type { ReactNode } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum } from "utils/generatedTypes";

type LockPositionButtonRenderState = {
  isGroup: boolean;
  positionAndSizeLocked: boolean;
  iconClassName: string;
  label: string;
  onClick: () => void;
};

type LockPositionButtonStyleState = {
  canEditLayout: boolean;
  hasSectionStyleTheme: boolean;
  isGroup: boolean;
  positionAndSizeLocked: boolean;
};

type LockPositionButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
  render?: (state: LockPositionButtonRenderState) => ReactNode;
};

function getIconSizeClassName({
  isGroup,
  positionAndSizeLocked,
}: Pick<
  LockPositionButtonStyleState,
  "isGroup" | "positionAndSizeLocked"
>): string {
  if (!isGroup) {
    return "[&>i]:!scale-[.4]";
  }
  return positionAndSizeLocked
    ? "[&>i]:!-mt-[6px]"
    : "[&>i]:!scale-50 [&>i]:!-mt-[9px]";
}

function getToneClassNames({
  hasSectionStyleTheme,
  isGroup,
  positionAndSizeLocked,
}: Pick<
  LockPositionButtonStyleState,
  "hasSectionStyleTheme" | "isGroup" | "positionAndSizeLocked"
>) {
  if (hasSectionStyleTheme) {
    return positionAndSizeLocked
      ? {
          backgroundClassName: "bg-[color:var(--setta-section-style-bg)]",
          focusRingClassName:
            "focus-visible:ring-[var(--setta-section-style-outline)]",
          hoverClassName: "",
          textClassName: "text-[color:var(--setta-section-style-outline)]",
        }
      : {
          backgroundClassName:
            "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]",
          focusRingClassName:
            "focus-visible:ring-[var(--setta-section-style-outline)]",
          hoverClassName: "",
          textClassName:
            "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)]",
        };
  }
  if (positionAndSizeLocked) {
    return {
      backgroundClassName:
        "shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] hover:bg-orange-500 dark:border-transparent dark:bg-transparent dark:shadow-none dark:hover:bg-orange-500",
      focusRingClassName: "",
      hoverClassName: "hover:text-orange-500 dark:hover:text-orange-700",
      textClassName:
        "text-orange-600 hover:!text-orange-100 dark:text-orange-500 dark:hover:!text-orange-100",
    };
  }
  return {
    backgroundClassName: "bg-transparent",
    focusRingClassName: "",
    hoverClassName: "hover:text-orange-500 dark:hover:text-orange-700",
    textClassName: isGroup
      ? "text-setta-400 dark:text-setta-600"
      : "text-setta-600",
  };
}

function getButtonClassName(styleState: LockPositionButtonStyleState): string {
  const {
    backgroundClassName,
    focusRingClassName,
    hoverClassName,
    textClassName,
  } = getToneClassNames(styleState);
  const sizeClassName = styleState.isGroup ? "h-5 w-5" : "h-4 w-4";
  return [
    "nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2",
    focusRingClassName,
    backgroundClassName,
    getIconSizeClassName(styleState),
    textClassName,
    "mr-1 rounded-full p-0",
    hoverClassName,
    sizeClassName,
    styleState.canEditLayout ? "" : "cursor-not-allowed opacity-50",
  ]
    .filter(Boolean)
    .join(" ");
}

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
  const label = positionAndSizeLocked
    ? "Unlock position and size"
    : "Lock position and size";
  const buttonClassName = getButtonClassName({
    canEditLayout,
    hasSectionStyleTheme,
    isGroup,
    positionAndSizeLocked,
  });

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
        callOpenAPI(
          togglePositionLocks({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionIds: [sectionId],
              frontendOpId,
            },
          } as Parameters<typeof togglePositionLocks>[0]),
        ),
    });
  }
  if (render) {
    return render({
      isGroup,
      positionAndSizeLocked,
      iconClassName,
      label,
      onClick,
    });
  }
  return (
    <button
      className={buttonClassName}
      aria-label={label}
      onClick={onClick}
      disabled={!canEditLayout}
      title={label}
      type="button"
      {...getFloatingBoxHandlers({ content: label })}
    >
      <i className={iconClassName} />
    </button>
  );
}
