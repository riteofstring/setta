import { recordSettingsGraphSubstrateCanaryMotionAttributionDuration } from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
import React from "react";
import {
  getAttachedTerminalParentIdForTerminalSection,
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
} from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useAgenticScopeHighlights, useProjectState } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";
import "./dndline.css";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";
import {
  getSectionContainerShellClassName,
  resolveSectionChromeShellDecorations,
  type SectionChromeBodySurface,
} from "./sectionChrome";
import { useSectionChromeAppearance } from "./sectionChromeAppearance";
import {
  SectionContainerCoreResizable,
  type SectionContainerHeaderRenderProps,
} from "./SectionContainerCoreResizabe";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";
import { getOnSectionClick, useAiSectionHighlight } from "./utils";

export type SectionContainerShellLayerSnapshot = {
  hasSectionStyleTheme: boolean;
  isInOtherProjectConfigs: boolean;
  positionAndSizeLocked: boolean;
  sectionStyleVars: React.CSSProperties | undefined;
  sectionTypeName: SectionType;
};

function handleSectionContainerCoreShellLayerRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionCoreShellLayerReactRender",
    actualDuration,
  );
}

type SectionContainerCoreProps = {
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  forceTransparentBackground?: boolean;
  shellChromeOwner?: "section-body" | "shell-layer";
  headerRenderer?:
    | React.ComponentType<SectionContainerHeaderRenderProps>
    | undefined;
  sectionId: string;
  isUserView: boolean;
  forceHideOutline?: boolean;
  forceHideFrameBorder?: boolean;
  forceTransparentBorder?: boolean;
  forceHideTopDragHandle?: boolean;
  hideAgenticEdgeHandles?: boolean;
  omitAgenticHandleScopeClass?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
  shellLayerSnapshot?: SectionContainerShellLayerSnapshot;
};

type SectionContainerCoreShellLayerSharedProps = Pick<
  SectionContainerCoreProps,
  | "bodySurfaceOverride"
  | "forceTransparentBackground"
  | "forceHideFrameBorder"
  | "forceHideTopDragHandle"
  | "headerRenderer"
  | "isUserView"
  | "sectionId"
>;

function SectionContainerCoreShellLayerLayout({
  bodySurfaceOverride,
  forceTransparentBackground = false,
  headerRenderer,
  sectionId,
  isUserView,
  forceHideFrameBorder = false,
  forceHideTopDragHandle = false,
  shellLayerSnapshot,
}: SectionContainerCoreShellLayerSharedProps & {
  shellLayerSnapshot: SectionContainerShellLayerSnapshot;
}) {
  const isAttachedTerminalChild = useProjectState(
    (x) => getAttachedTerminalParentIdForTerminalSection(x, sectionId) !== null,
  );
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const {
    hasSectionStyleTheme,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    sectionStyleVars,
    sectionTypeName,
  } = shellLayerSnapshot;

  return (
    <React.Profiler
      id={`section-container-core-shell-layer:${sectionId}`}
      onRender={handleSectionContainerCoreShellLayerRender}
    >
      <section
        className="z-10"
        onClick={getOnSectionClick(sectionId)}
        ref={refForPosition}
        data-section-id={sectionId}
        data-section-type={sectionTypeName}
        data-section-active="false"
        data-shell-chrome-owner="shell-layer"
        data-setta-viewport-interaction-shell="true"
        style={sectionStyleVars}
      >
        <SectionContainerCoreResizable
          bodySurfaceOverride={bodySurfaceOverride}
          forceTransparentBackground={forceTransparentBackground}
          headerRenderer={headerRenderer}
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          positionAndSizeLocked={positionAndSizeLocked}
          hideHeader={isAttachedTerminalChild}
          hasSectionStyleTheme={hasSectionStyleTheme}
          forceHideFrameBorder={forceHideFrameBorder}
          forceHideTopDragHandle={forceHideTopDragHandle}
        />
      </section>
    </React.Profiler>
  );
}

function SectionContainerCoreShellLayerWithStore(
  props: SectionContainerCoreShellLayerSharedProps,
) {
  const { sectionId } = props;
  const {
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    sectionTypeName,
    styleColor,
    textBlockMetaControlStyle,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      sectionTypeName: impl.type,
      styleColor: impl.styleColor,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
    };
  }, shallow);
  const { hasSectionStyleTheme, sectionStyleVars } = useSectionChromeAppearance(
    {
      sectionId,
      sectionTypeName,
      styleColor,
      textBlockMetaControlStyle,
    },
  );

  return (
    <SectionContainerCoreShellLayerLayout
      {...props}
      shellLayerSnapshot={{
        hasSectionStyleTheme,
        isInOtherProjectConfigs,
        positionAndSizeLocked,
        sectionStyleVars,
        sectionTypeName,
      }}
    />
  );
}

function SectionContainerCoreShellLayer(props: SectionContainerCoreProps) {
  const { shellLayerSnapshot, ...sharedProps } = props;

  if (shellLayerSnapshot) {
    return (
      <SectionContainerCoreShellLayerLayout
        {...sharedProps}
        shellLayerSnapshot={shellLayerSnapshot}
      />
    );
  }

  return <SectionContainerCoreShellLayerWithStore {...sharedProps} />;
}

function SectionContainerCoreSectionBody({
  bodySurfaceOverride,
  forceTransparentBackground = false,
  headerRenderer,
  sectionId,
  isUserView,
  forceHideOutline = false,
  forceHideFrameBorder = false,
  forceTransparentBorder = false,
  forceHideTopDragHandle = false,
  hideAgenticEdgeHandles = false,
  omitAgenticHandleScopeClass = false,
  joinedCorners = "none",
}: SectionContainerCoreProps) {
  const {
    sectionTypeName,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    textBlockMetaControlStyle,
    projectConfigId,
    isAttachedTerminalChild,
    styleColor,
    isJoinedAttachedTerminalChild,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const isAttachedTerminalChild =
      getAttachedTerminalParentIdForTerminalSection(x, sectionId) !== null;
    const isJoinedAttachedTerminalChild =
      getEmbeddedAttachedTerminalParentIdForTerminalSection(x, sectionId) !==
        null && !impl.isMinimized;
    return {
      sectionTypeName: impl.type,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      projectConfigId: x.projectConfig.id,
      isAttachedTerminalChild,
      styleColor: impl.styleColor,
      isJoinedAttachedTerminalChild,
    };
  }, shallow);
  const isActiveSection = useIsSectionUIActive(sectionId);
  const showAiHighlight = useAiSectionHighlight(sectionId, projectConfigId);
  const { isReadScope, isWriteScope } = useAgenticScopeHighlights(
    (state) => ({
      isWriteScope: Boolean(
        state.writeSectionIdsByProjectConfigId[projectConfigId]?.[sectionId],
      ),
      isReadScope: Boolean(
        state.readSectionIdsByProjectConfigId[projectConfigId]?.[sectionId],
      ),
    }),
    shallow,
  );
  const showReadScope = !isWriteScope && isReadScope;
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isGlobalVariables = sectionTypeName === SectionTypeEnum.GlobalVariables;
  const { hasSectionStyleTheme, sectionStyleVars, useMetaControlStyle } =
    useSectionChromeAppearance({
      sectionId,
      sectionTypeName,
      styleColor,
      textBlockMetaControlStyle,
    });
  const shellDecorations = resolveSectionChromeShellDecorations({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    showAiHighlight,
    isReadScope: showReadScope,
    isWriteScope,
  });
  const sectionShellClassName = getSectionContainerShellClassName({
    outlineTone: shellDecorations.outlineTone,
    scopeHighlight: shellDecorations.scopeHighlight,
    showAiHighlight: shellDecorations.showAiHighlight,
    useMetaControlStyle,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    forceHideOutline,
    forceTransparentBorder,
    joinedCorners,
    isJoinedAttachedTerminalChild,
    omitAgenticHandleScopeClass,
  });
  const shouldRenderSharedChatHandles =
    !hideAgenticEdgeHandles && !isAttachedTerminalChild;
  const isWorkflowOnlyNodeSection =
    sectionTypeName === SectionTypeEnum.StateMachineStart ||
    sectionTypeName === SectionTypeEnum.StateMachineGate ||
    sectionTypeName === SectionTypeEnum.StateMachineEnd;
  const shouldRenderChatSharedHandles =
    shouldRenderSharedChatHandles && sectionTypeName === SectionTypeEnum.Chat;
  const shouldRenderAgenticEdgeHandles =
    shouldRenderSharedChatHandles &&
    !shouldRenderChatSharedHandles &&
    !isWorkflowOnlyNodeSection;
  const shouldRenderStateMachineEdgeHandles =
    shouldRenderSharedChatHandles && isWorkflowOnlyNodeSection;

  return (
    <section
      className={`${sectionShellClassName} ${shellDecorations.zIndexClassName}`}
      onClick={getOnSectionClick(sectionId)}
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-section-active={isActiveSection ? "true" : "false"}
      data-shell-chrome-owner="section-body"
      data-setta-viewport-interaction-shell="true"
      style={sectionStyleVars}
    >
      {shouldRenderChatSharedHandles ? (
        <ChatSharedEdgeHandles isUserView={isUserView} />
      ) : null}
      {shouldRenderAgenticEdgeHandles ? (
        <AgenticEdgeHandles isUserView={isUserView} />
      ) : null}
      {shouldRenderStateMachineEdgeHandles ? (
        <StateMachineEdgeHandles isUserView={isUserView} />
      ) : null}
      <MinimizedDataEdgeHandles sectionId={sectionId} />
      <SectionContainerCoreResizable
        bodySurfaceOverride={bodySurfaceOverride}
        forceTransparentBackground={forceTransparentBackground}
        headerRenderer={headerRenderer}
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        hideHeader={isAttachedTerminalChild}
        hasSectionStyleTheme={hasSectionStyleTheme}
        forceHideFrameBorder={forceHideFrameBorder}
        forceHideTopDragHandle={forceHideTopDragHandle}
      />
    </section>
  );
}

function _SectionContainerCore({
  shellChromeOwner = "section-body",
  ...props
}: SectionContainerCoreProps) {
  if (shellChromeOwner === "shell-layer") {
    return (
      <SectionContainerCoreShellLayer
        {...props}
        shellChromeOwner={shellChromeOwner}
      />
    );
  }

  return (
    <SectionContainerCoreSectionBody
      {...props}
      shellChromeOwner={shellChromeOwner}
    />
  );
}

export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (previousProps, nextProps) =>
    previousProps.bodySurfaceOverride === nextProps.bodySurfaceOverride &&
    previousProps.forceTransparentBackground ===
      nextProps.forceTransparentBackground &&
    previousProps.shellChromeOwner === nextProps.shellChromeOwner &&
    previousProps.headerRenderer === nextProps.headerRenderer &&
    previousProps.sectionId === nextProps.sectionId &&
    previousProps.isUserView === nextProps.isUserView &&
    previousProps.forceHideOutline === nextProps.forceHideOutline &&
    previousProps.forceHideFrameBorder === nextProps.forceHideFrameBorder &&
    previousProps.forceTransparentBorder === nextProps.forceTransparentBorder &&
    previousProps.forceHideTopDragHandle === nextProps.forceHideTopDragHandle &&
    previousProps.hideAgenticEdgeHandles === nextProps.hideAgenticEdgeHandles &&
    previousProps.omitAgenticHandleScopeClass ===
      nextProps.omitAgenticHandleScopeClass &&
    previousProps.joinedCorners === nextProps.joinedCorners &&
    previousProps.shellLayerSnapshot === nextProps.shellLayerSnapshot,
);
