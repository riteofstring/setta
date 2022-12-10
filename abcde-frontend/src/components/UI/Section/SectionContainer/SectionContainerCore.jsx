import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React, { useState } from "react";
import { setSectionConfigAttr } from "thunks/sections";
import { isRoot, isSeriesElement, SECTIONWIDTH } from "utils/constants";
import { SectionHeader } from "./Header/SectionHeader";
import {
  KwargGroupContainer,
  ParamGroupContainer,
} from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionDescription from "./Main/SectionDescription/SectionDescription";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const [selectedItem] = useGetSectionConfig(sectionId, ["selectedItem"]);
  const [sectionTypeName, config] = useGetSectionType(sectionId, [
    "type",
    "config",
  ]);
  const _isSeriesElement = isSeriesElement(config.subType);
  const _isRoot = isRoot(sectionTypeName);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);
  const [isActive, setIsActive] = useState(false);

  function onSelectedItemChange(value) {
    setSectionConfigAttr({
      sectionId,
      attr: "selectedItem",
      value,
    });
  }

  const boxShadow = isActive || isActiveSection ? "shadow-2xl" : "shadow-md";
  const outlineColor =
    isActive && !isActiveSection
      ? "outline-cyan-300"
      : isActiveSection
      ? "outline-blue-300"
      : "outline-transparent";

  // TODO: determine tempBoolDesc dynamically
  const tempBoolDesc = false;
  return (
    <div
      className={`items-stretch rounded-xl bg-white ${boxShadow} outline outline-4 ${outlineColor} duration-150`}
      style={{
        width: `${SECTIONWIDTH}px`,
      }}
      onClick={() => setActiveSection(sectionId)}
      onMouseDown={() => !isActive && setIsActive(true)}
      onMouseUp={() => isActive && setIsActive(false)}
      data-testid={`${sectionId} section core`}
    >
      <div
        className="flex-col bg-gray-50 rounded-xl px-2 shadow-md w-full border border-white overflow-hidden"
        style={{ zIndex: isActiveSection ? 150 : 10 }}
      >
        <div className="px-1 py-4 w-full">
          <SectionHeader
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            isSeriesElement={_isSeriesElement}
            isRoot={_isRoot}
            hasNested={hasNested}
          />
          {!_isRoot && (
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
