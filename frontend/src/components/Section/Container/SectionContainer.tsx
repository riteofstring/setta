import { NodeIdProvider } from "forks/xyflow/core/contexts/NodeIdContext";
import _ from "lodash";
import React from "react";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum } from "utils/generatedTypes";
import { EmbeddedTerminalArea } from "../Layouts/TerminalArea";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";
import { getOnSectionClick } from "./utils";

function _SectionContainer({
  sectionId,
  isTopLevel,
  dragListeners,
  renderMode = "default",
}: {
  sectionId: string;
  isTopLevel: boolean;
  dragListeners?: any;
  renderMode?: "default" | "embedded";
}) {
  const {
    visibility,
    isEditingViewMode,
    isGroup,
    isCode,
    isUserView,
    isGenPython,
    isGenPythonMetadata,
    hasPythonCodegen,
    hasMetadata,
    sectionTypeName,
  } = useProjectState((x) => {
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      sectionId,
      x,
    );
    const viewMode = getActiveViewModeConfig(x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const pythonTarget = getPythonCodegenTarget(x.projectConfig);
    return {
      visibility,
      isEditingViewMode,
      isUserView: viewMode.isUserFacing && !isEditingViewMode,
      isGroup: impl.type === SectionTypeEnum.Group,
      isCode: impl.type === SectionTypeEnum.Code,
      isGenPython: impl.type === SectionTypeEnum.GenPythonCode,
      isGenPythonMetadata: impl.type === SectionTypeEnum.GenPythonMetadata,
      hasPythonCodegen: projectConfigHasPythonCodegen(x.projectConfig),
      hasMetadata: Boolean(pythonTarget?.generateMetadata),
      sectionTypeName: impl.type,
    };
  }, _.isEqual);

  if (isGenPython && !hasPythonCodegen) {
    return null;
  }
  if (isGenPythonMetadata && !hasMetadata) {
    return null;
  }

  if (!getSectionShouldRender(visibility, isEditingViewMode)) {
    return null;
  }

  const isEmbedded = renderMode === "embedded";
  const containerClassName = isEmbedded
    ? "flex min-h-0 w-full flex-1"
    : undefined;

  return (
    <NodeIdProvider value={sectionId}>
      <ContainerSwitch
        isGroup={isGroup}
        sectionId={sectionId}
        dragListeners={dragListeners}
        isTopLevel={isTopLevel}
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
        containerClassName={containerClassName}
      >
        {isEmbedded ? (
          <EmbeddedSectionContainer
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
          />
        ) : (
          <>
            {!isGroup && (
              <SectionContainerCore
                sectionId={sectionId}
                isUserView={isUserView}
              />
            )}
            {isCode ? (
              <MaybeManyNestedSections
                sectionId={sectionId}
                isGroup={isGroup}
                layoutVariant="tight"
              />
            ) : (
              <MaybeManyNestedSections
                sectionId={sectionId}
                isGroup={isGroup}
              />
            )}
          </>
        )}
      </ContainerSwitch>
    </NodeIdProvider>
  );
}
export const SectionContainer = React.memo(
  _SectionContainer,
  (p, n) =>
    _.isEqual(p.dragListeners, n.dragListeners) &&
    p.renderMode === n.renderMode,
);

function EmbeddedSectionContainer({
  sectionId,
  sectionTypeName,
}: {
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
}) {
  const sectionRef = useSectionRefAndInit(sectionId, "selfOnly");
  React.useEffect(() => {
    console.info(
      JSON.stringify({
        event: "embedded-section-render",
        sectionId,
        sectionTypeName,
      }),
    );
    return () => {
      console.info(
        JSON.stringify({
          event: "embedded-section-unmount",
          sectionId,
          sectionTypeName,
        }),
      );
    };
  }, [sectionId, sectionTypeName]);
  if (sectionTypeName !== SectionTypeEnum.Terminal) {
    return null;
  }
  return (
    <div
      ref={sectionRef}
      className="relative flex min-h-0 w-full flex-1"
      onClick={getOnSectionClick(sectionId)}
      tabIndex={-1}
    >
      <EmbeddedTerminalArea
        sectionId={sectionId}
        className="flex min-h-0 flex-1"
      />
    </div>
  );
}
