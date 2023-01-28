import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useIsRoot, useIsSeriesElement } from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React from "react";
import { setSelectedItem } from "thunks/sections/sections";
import { SECTIONWIDTH } from "utils/constants";
import { CustomResizable } from "utils/Resizable/CustomResizable";
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
    <CustomResizable>
      <div
        className={`flex flex-col flex-grow rounded-xl bg-white ${boxShadow} outline outline-4 ${outlineColor} duration-150 dndline min-w-[${SECTIONWIDTH}px] overflow-auto`}
        onClick={() => setActiveSection(sectionId)}
        data-testid={`${sectionId} section core`}
      >
        <div
          className="flex  flex-col flex-grow bg-gray-50 rounded-xl px-3 gap-2 py-4 shadow-md border border-white overflow-hidden"
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
        <KwargGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
      </div>
    </CustomResizable>
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
