import {
  toggleSectionDescription,
  useSectionHasDescription,
} from "hooks/useSectionDescription";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import {
  useIsGlobalVariables,
  useIsInfo,
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
  useIsSocial,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import { useTypeErrors } from "models/typeErrors";
import React from "react";
import { setZIndices } from "thunks/sections/sectionPositions";
import { getHighestAncestor } from "thunks/sections/sectionSizes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const isRoot = useIsRoot(sectionId);
  const isOutput = useIsOutput(sectionId);
  const isSocial = useIsSocial(sectionId);
  const isInfo = useIsInfo(sectionId);
  const isGlobalVariables = useIsGlobalVariables(sectionId);
  const hasDescription = useSectionHasDescription(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);
  const thisSectionParamInfo = useGetSectionInfo(sectionId, "paramInfoId");
  const isWrongType = useTypeErrors((x) => x[parentId]?.[thisSectionParamInfo]);

  function onClick() {
    setActiveSection(sectionId);
    const topMostAncestor = getHighestAncestor(sectionId);
    setZIndices([useSectionInfos.getState().x[topMostAncestor]], false);
  }

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <div
      className={`rounded-xl border border-white bg-white dark:border-slate-700 dark:bg-runcoder-900 ${boxShadow} dndline w-min [transition:_box-shadow_500ms_ease]`}
      onClick={onClick}
      data-testid={`${sectionId} section core`}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        isSeriesElement={isSeriesElement}
        isRoot={isRoot}
        isOutput={isOutput}
        isSocial={isSocial}
        isInfo={isInfo}
        isGlobalVariables={isGlobalVariables}
        hasNested={hasNested}
        hasDescription={hasDescription}
        isActiveSection={isActiveSection}
        toggleDescVis={() => toggleSectionDescription(sectionId)}
        isWrongType={isWrongType}
      />
    </div>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (prev, next) => {
    const attrs = ["nextId", "hasNested"];
    for (let k of attrs) {
      if (!_.isEqual(prev[k], next[k])) {
        return false;
      }
    }
    return true;
  }
);
