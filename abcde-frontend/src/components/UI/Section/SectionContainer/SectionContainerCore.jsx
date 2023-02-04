import { useGetSectionConfig } from "hooks/useSectionConfig";
import {
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React, { useState } from "react";
import { BiInfoCircle } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import "./dndline.css";
import { SectionHeader } from "./Header/SectionHeader";
import { InputArea } from "./InputArea";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";
import { OutputArea } from "./OutputArea";
import { ResizeIcon } from "./ResizeIcon/ResizeIcon";

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

  const [descVis, setDescVis] = useState(false);

  // flex flex-grow flex-col
  return (
    <div
      className={`rounded-xl bg-white ${boxShadow} dndline w-min transition-all duration-150`}
      onClick={() => setActiveSection(sectionId)}
      data-testid={`${sectionId} section core`}
    >
      <div
        className={`outline outline-4 ${outlineColor} rounded-xl border border-white bg-gray-50 shadow-md transition-all`}
        style={{ zIndex: isActiveSection ? 150 : 10 }}
      >
        <CustomResizable sectionId={sectionId}>
          <div className="flex flex-grow flex-col gap-2 overflow-hidden py-4 [&>div:not(.section-full-width)]:px-5">
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
          <IconButton
            size="w-6 h-6 self-center text-gray-400"
            onClick={() => {
              setDescVis(!descVis);
            }}
          >
            <BiInfoCircle className="z-[3] h-5 w-5" />
          </IconButton>

          <ResizeIcon />
        </CustomResizable>
      </div>
      <SectionDescription sectionId={sectionId} descVis={descVis} />
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
