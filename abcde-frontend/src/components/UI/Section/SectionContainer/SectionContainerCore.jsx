import { useGetSectionConfig } from "hooks/useSectionConfig";
import {
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React from "react";
import { RxCornerBottomRight } from "react-icons/rx";
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

  // flex flex-grow flex-col
  return (
    <div
      className={` rounded-xl bg-white ${boxShadow} outline outline-4 ${outlineColor} dndline duration-150`}
      onClick={() => setActiveSection(sectionId)}
      data-testid={`${sectionId} section core`}
    >
      {/*   overflow-hidden  */}
      <div
        className="rounded-xl border border-white bg-gray-50  shadow-md"
        style={{ zIndex: isActiveSection ? 150 : 10 }}
      >
        <CustomResizable sectionId={sectionId}>
          <div className="flex flex-grow flex-col gap-2 overflow-hidden px-3 py-4">
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
          <RxCornerBottomRight className="absolute bottom-1 right-1 text-gray-500" />
        </CustomResizable>
      </div>
      {!isOutput && (
        <KwargGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
      )}
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
