import _ from "lodash";
import React from "react";
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
import { SectionBodyGate } from "./SectionBodyGate";
import { getWindowSectionChrome } from "./sectionChrome";

type SectionWindowSurfaceProps = {
  sectionId: string;
  headerActions: React.ReactNode;
  roundedClassName: string;
  chatHost: ChatWindowPlacement | "standalone_page";
  chatModeOverride?: ChatWindowMode | undefined;
  projectChatSurfaceId?: string | undefined;
  projectChatId?: string | null | undefined;
  setProjectChatId?:
    | ((next: SetStateAction<string | null | undefined>) => void)
    | undefined;
  onProjectChatBlockedErrorCodeChange?:
    | ((errorCode: string | null) => void)
    | undefined;
  bodyOverride?: React.ReactNode | undefined;
  headerProps?: Omit<
    React.ComponentPropsWithoutRef<"header">,
    "children" | "ref"
  > | undefined;
};

type SectionWindowSurfaceBodyProps = {
  bgColor: string;
  bodyOverride: React.ReactNode;
  sectionId: string;
  chatHost: ChatWindowPlacement | "standalone_page";
  chatModeOverride?: ChatWindowMode | undefined;
  projectChatSurfaceId?: string | undefined;
  projectChatId?: string | null | undefined;
  setProjectChatId?:
    | ((next: SetStateAction<string | null | undefined>) => void)
    | undefined;
  onProjectChatBlockedErrorCodeChange?:
    | ((errorCode: string | null) => void)
    | undefined;
};

const SectionWindowSurfaceBody = React.memo(function SectionWindowSurfaceBody({
  bgColor,
  bodyOverride,
  sectionId,
  chatHost,
  chatModeOverride,
  projectChatSurfaceId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
}: SectionWindowSurfaceBodyProps) {
  return (
    <div
      className={`section-main-full-w flex min-h-0 flex-1 flex-col overflow-hidden ${bgColor}`}
    >
      {bodyOverride ?? (
        <SectionBodyGate
          sectionId={sectionId}
          owner={{
            kind: "window",
            bgColor,
            chatHost,
            ...(chatModeOverride === undefined ? {} : { chatModeOverride }),
            ...(projectChatSurfaceId === undefined
              ? {}
              : { projectChatSurfaceId }),
            ...(projectChatId === undefined ? {} : { projectChatId }),
            ...(setProjectChatId === undefined ? {} : { setProjectChatId }),
            ...(onProjectChatBlockedErrorCodeChange === undefined
              ? {}
              : { onProjectChatBlockedErrorCodeChange }),
          }}
        />
      )}
    </div>
  );
});

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
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    textBlockMetaControlStyle,
    styleColor,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    return {
      sectionTypeName: impl.type,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
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
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const darkMode = useLocalStorage((state) => state.darkMode);
  const useMetaControlStyle =
    sectionTypeName === SectionTypeEnum.MetaControl ||
    textBlockMetaControlStyle;
  const sectionStyleTheme =
    resolvedStyleColor && !useMetaControlStyle
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null;
  const hasSectionStyleTheme = Boolean(sectionStyleTheme);
  const sectionStyleVars = sectionStyleTheme
    ? ({
        "--setta-section-style-bg": sectionStyleTheme.bg,
        "--setta-section-style-panel-bg": sectionStyleTheme.panelBg,
        "--setta-section-style-border": sectionStyleTheme.border,
        "--setta-section-style-outline": sectionStyleTheme.outline,
        "--setta-section-style-text": sectionStyleTheme.text,
        "--setta-section-style-muted-text": sectionStyleTheme.mutedText,
      } as React.CSSProperties)
    : undefined;
  const isRoot = getIsRoot(sectionTypeName);
  const windowChrome = getWindowSectionChrome({
    sectionTypeName,
    isActiveSection: false,
    isInOtherProjectConfigs,
    textBlockMetaControlStyle,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    isStandalonePage,
    roundedClassName,
  });

  return (
    <section
      className={windowChrome.outerShellClassName}
      style={sectionStyleVars}
      data-testid="section-window-surface"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
    >
      <div className={windowChrome.innerShellClassName}>
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
          {...(headerProps === undefined ? {} : { headerProps })}
        />
        <SectionWindowSurfaceBody
          bgColor={windowChrome.bgColor}
          bodyOverride={bodyOverride}
          sectionId={sectionId}
          chatHost={chatHost}
          chatModeOverride={chatModeOverride}
          projectChatSurfaceId={projectChatSurfaceId}
          projectChatId={projectChatId}
          setProjectChatId={setProjectChatId}
          onProjectChatBlockedErrorCodeChange={
            onProjectChatBlockedErrorCodeChange
          }
        />
      </div>
    </section>
  );
}
