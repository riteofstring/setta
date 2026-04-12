import _ from "lodash";
import type React from "react";
import type { SetStateAction } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import {
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { AreaSwitch } from "./SectionContainerCoreResizabe";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionChromeShellDecorations,
} from "./sectionChrome";
import { useSectionChromeAppearance } from "./sectionChromeAppearance";

type SectionWindowSurfaceProps = {
  sectionId: string;
  headerActions: React.ReactNode;
  roundedClassName: string;
  chatHost: ChatWindowPlacement | "standalone_page";
  chatModeOverride?: ChatWindowMode;
  projectChatSurfaceId?: string;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
  bodyOverride?: React.ReactNode;
  headerProps?: Omit<
    React.ComponentPropsWithoutRef<"header">,
    "children" | "ref"
  >;
};

export function SectionWindowSurface({
  sectionId,
  headerActions,
  roundedClassName,
  chatHost,
  chatModeOverride,
  projectChatSurfaceId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
  bodyOverride = null,
  headerProps,
}: SectionWindowSurfaceProps) {
  const isStandalonePage = chatHost === "standalone_page";
  const {
    sectionTypeName,
    isActiveSection,
    isInOtherProjectConfigs,
    isMinimized,
    positionAndSizeLocked,
    textBlockMetaControlStyle,
    styleColor,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    return {
      sectionTypeName: impl.type,
      isActiveSection: state.projectConfig.activeIds.includes(sectionId),
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      isMinimized: impl.isMinimized,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      styleColor: impl.styleColor,
    };
  }, _.isEqual);
  const {
    bgColor,
    hasSectionStyleTheme,
    sectionStyleVars,
    useMetaControlStyle,
  } = useSectionChromeAppearance({
    sectionId,
    sectionTypeName,
    styleColor,
    textBlockMetaControlStyle,
  });
  const isRoot = getIsRoot(sectionTypeName);
  const shellDecorations = resolveSectionChromeShellDecorations({
    isActiveSection,
    isGlobalVariables: sectionTypeName === SectionTypeEnum.GlobalVariables,
    isInOtherProjectConfigs,
    showAiHighlight: false,
    isReadScope: false,
    isWriteScope: false,
  });
  const outerShellClassName = getSectionContainerShellClassName({
    outlineTone: shellDecorations.outlineTone,
    scopeHighlight: shellDecorations.scopeHighlight,
    showAiHighlight: shellDecorations.showAiHighlight,
    useMetaControlStyle,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    forceHideOutline: true,
    hideBorder: isStandalonePage,
    sizeClassName: "h-full w-full",
    cornerClassName: isStandalonePage ? "rounded-none" : roundedClassName,
  });
  const innerShellClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    cornerClassName: isStandalonePage ? "rounded-none" : roundedClassName,
    hideFrameBorder: isStandalonePage,
  });

  return (
    <section
      className={outerShellClassName}
      style={sectionStyleVars}
      data-testid="section-window-surface"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
    >
      <div className={innerShellClassName}>
        <SectionHeader
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={false}
          isRoot={isRoot}
          hasSectionStyleTheme={hasSectionStyleTheme}
          showSectionContainerControls={false}
          extraControls={headerActions}
          trackMeasuredHeight={false}
          {...(headerProps ? { headerProps } : {})}
        />
        <div
          className={`section-main-full-w flex min-h-0 flex-1 flex-col overflow-hidden ${bgColor}`}
        >
          {bodyOverride ?? (
            <AreaSwitch
              sectionId={sectionId}
              sectionTypeName={sectionTypeName}
              bgColor={bgColor}
              isMinimized={isMinimized}
              isUserView={false}
              chatHost={chatHost}
              {...(chatModeOverride !== undefined ? { chatModeOverride } : {})}
              {...(projectChatSurfaceId !== undefined
                ? { projectChatSurfaceId }
                : {})}
              {...(projectChatId !== undefined ? { projectChatId } : {})}
              {...(setProjectChatId !== undefined ? { setProjectChatId } : {})}
              {...(onProjectChatBlockedErrorCodeChange !== undefined
                ? { onProjectChatBlockedErrorCodeChange }
                : {})}
            />
          )}
        </div>
      </div>
    </section>
  );
}
