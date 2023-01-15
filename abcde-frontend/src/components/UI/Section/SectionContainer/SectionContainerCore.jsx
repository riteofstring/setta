import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useIsRoot, useIsSeriesElement } from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React from "react";
import { setSelectedItem } from "thunks/sections/sections";
// import { SECTIONWIDTH } from "utils/constants";
import { NodeResizer } from "@reactflow/node-resizer";
import "@reactflow/node-resizer/dist/style.css";
import "./dndline.css";
import { SectionHeader } from "./Header/SectionHeader";
import {
  KwargGroupContainer,
  ParamGroupContainer,
} from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionDescription from "./Main/SectionDescription/SectionDescription";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const isRoot = useIsRoot(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);

  function onSelectedItemChange(value) {
    setSelectedItem(sectionId, value);
  }

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  const outlineColor = isActiveSection
    ? "outline-blue-500"
    : "outline-transparent active:outline-cyan-300";

  // TODO: determine tempBoolDesc dynamically
  const tempBoolDesc = false;
  return (
    <>
      <NodeResizer minWidth={100} minHeight={30} />
      <div
        className={`items-stretch rounded-xl bg-white ${boxShadow} outline outline-4 ${outlineColor} duration-150 dndline min-w-[450px]`}
        // style={{
        //   width: `${SECTIONWIDTH}px`,
        // }}
        onClick={() => setActiveSection(sectionId)}
        data-testid={`${sectionId} section core`}
      >
        <div
          className="flex-col bg-gray-50 rounded-xl px-2 shadow-md w-full border border-white overflow-hidden"
          style={{ zIndex: isActiveSection ? 150 : 10 }}
        >
          <div className="flex flex-col gap-2 px-1 py-4 w-full">
            <SectionHeader
              sectionId={sectionId}
              parentId={parentId}
              nextId={nextId}
              isSeriesElement={isSeriesElement}
              isRoot={isRoot}
              hasNested={hasNested}
            />
            {!isRoot && (
              <>
                <SectionSearch
                  sectionId={sectionId}
                  initialSelection={selectedItem}
                  onSelectedItemChange={onSelectedItemChange}
                />
                {tempBoolDesc && <SectionDescription />}
                <ParamGroupContainer
                  sectionId={sectionId}
                  objInfoId={selectedItem}
                />
              </>
            )}
          </div>
        </div>
        <KwargGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
      </div>
    </>
  );
}

const SectionContainerCore = React.memo(_SectionContainerCore, (prev, next) => {
  const attrs = ["nextId", "hasNested"];
  for (let k of attrs) {
    if (!_.isEqual(prev[k], next[k])) {
      return false;
    }
  }
  return true;
});

export default SectionContainerCore;
