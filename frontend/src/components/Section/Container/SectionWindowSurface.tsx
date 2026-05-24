import _ from "lodash";
import type React from "react";
import type { SetStateAction } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import {
  useLocalStorage,
  useProjectState,
  useTemporaryMiscState,
} from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import {
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { SectionHeader } from "../Header/SectionHeader";
import { AreaSwitch } from "./SectionContainerCoreResizabe";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./sectionChrome";
import { getBgColor } from "./utils";

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

type SectionWindowSurfaceAppearanceOptions = {
  sectionTypeName: SectionTypeEnum;
  textBlockMetaControlStyle: boolean;
  styleColor: string | null;
  previewStyleColor: string | null | undefined;
  darkMode: boolean;
};

function getSectionWindowSurfaceCornerClassName(
  isStandalonePage: boolean,
  roundedClassName: string,
) {
  return isStandalonePage ? "rounded-none" : roundedClassName;
}

function getSectionWindowSurfaceAppearance({
  sectionTypeName,
  textBlockMetaControlStyle,
  styleColor,
  previewStyleColor,
  darkMode,
}: SectionWindowSurfaceAppearanceOptions) {
  const defaultBgColor = getBgColor(sectionTypeName);
  const useMetaControlStyle =
    sectionTypeName === SectionTypeEnum.MetaControl ||
    textBlockMetaControlStyle;
  if (useMetaControlStyle) {
    return {
      bgColor: "bg-transparent",
      useMetaControlStyle,
      hasSectionStyleTheme: false,
      sectionStyleVars: undefined,
    };
  }

  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  if (!resolvedStyleColor) {
    return {
      bgColor: defaultBgColor,
      useMetaControlStyle,
      hasSectionStyleTheme: false,
      sectionStyleVars: undefined,
    };
  }

  const sectionStyleTheme = deriveSectionStyleTheme(
    resolvedStyleColor,
    darkMode,
  );
  return {
    bgColor: defaultBgColor,
    useMetaControlStyle,
    hasSectionStyleTheme: true,
    sectionStyleVars: {
      "--setta-section-style-bg": sectionStyleTheme.bg,
      "--setta-section-style-panel-bg": sectionStyleTheme.panelBg,
      "--setta-section-style-border": sectionStyleTheme.border,
      "--setta-section-style-outline": sectionStyleTheme.outline,
      "--setta-section-style-text": sectionStyleTheme.text,
      "--setta-section-style-muted-text": sectionStyleTheme.mutedText,
    } as React.CSSProperties,
  };
}

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
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (state) => state[styleColorPreviewKey] as string | null | undefined,
  );
  const darkMode = useLocalStorage((state) => state.darkMode);
  const surfaceCornerClassName = getSectionWindowSurfaceCornerClassName(
    isStandalonePage,
    roundedClassName,
  );
  const {
    bgColor,
    useMetaControlStyle,
    hasSectionStyleTheme,
    sectionStyleVars,
  } = getSectionWindowSurfaceAppearance({
    sectionTypeName,
    textBlockMetaControlStyle,
    styleColor,
    previewStyleColor,
    darkMode,
  });
  const isRoot = getIsRoot(sectionTypeName);
  const outerShellClassName = getSectionContainerShellClassName({
    isActiveSection,
    isGlobalVariables: sectionTypeName === SectionTypeEnum.GlobalVariables,
    isInOtherProjectConfigs,
    useMetaControlStyle,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    forceHideOutline: true,
    hideBorder: isStandalonePage,
    sizeClassName: "h-full w-full",
    cornerClassName: surfaceCornerClassName,
  });
  const innerShellClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    cornerClassName: surfaceCornerClassName,
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
          isActiveSection={isActiveSection}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={false}
          isRoot={isRoot}
          hasSectionStyleTheme={hasSectionStyleTheme}
          showSectionContainerControls={false}
          extraControls={headerActions}
          trackMeasuredHeight={false}
          headerProps={headerProps}
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
              chatModeOverride={chatModeOverride}
              projectChatSurfaceId={projectChatSurfaceId}
              projectChatId={projectChatId}
              setProjectChatId={setProjectChatId}
              onProjectChatBlockedErrorCodeChange={
                onProjectChatBlockedErrorCodeChange
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}
