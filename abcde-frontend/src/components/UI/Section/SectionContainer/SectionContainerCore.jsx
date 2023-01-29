import { useGetSectionConfig } from "hooks/useSectionConfig";
import {
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React from "react";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import "./dndline.css";
import { SectionHeader } from "./Header/SectionHeader";
import { InputArea } from "./InputArea";
import { KwargGroupContainer } from "./Main/Group/GroupContainer";
import { OutputArea } from "./OutputArea";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const isRoot = useIsRoot(sectionId);
  const isOutput = useIsOutput(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  const outlineColor = isActiveSection
    ? "outline-blue-500"
    : "outline-transparent active:outline-cyan-300";

  return (
    <CustomResizable sectionId={sectionId}>
      <div
        className={`flex flex-grow flex-col rounded-xl bg-white ${boxShadow} outline outline-4 ${outlineColor} dndline overflow-auto duration-150`}
        onClick={() => setActiveSection(sectionId)}
        data-testid={`${sectionId} section core`}
      >
        <div
          className="flex  flex-grow flex-col gap-2 overflow-hidden rounded-xl border border-white bg-gray-50 px-3 py-4 shadow-md"
          style={{ zIndex: isActiveSection ? 150 : 10 }}
        >
          <SectionHeader
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            isSeriesElement={isSeriesElement}
            isRoot={isRoot}
            hasNested={hasNested}
          />
          {!isOutput ? (
            <InputArea
              sectionId={sectionId}
              selectedItem={selectedItem}
              isRoot={isRoot}
            />
          ) : (
            <OutputArea sectionId={sectionId} />
          )}
        </div>
        {!isOutput && (
          <KwargGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
        )}
      </div>
    </CustomResizable>
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
