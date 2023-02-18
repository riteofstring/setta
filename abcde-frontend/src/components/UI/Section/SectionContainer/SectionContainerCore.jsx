import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useSectionHasDescription } from "hooks/useSectionDescription";
import {
  useIsInfo,
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useSectionDescription } from "models/info/sectionDescription";
import React from "react";
import { BiInfoCircle } from "react-icons/bi";
import { Button } from "utils/atoms/buttons/Button";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import "./dndline.css";
import { SectionHeader } from "./Header/SectionHeader";
import { InputArea } from "./InputArea";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";
import { OutputArea } from "./OutputArea";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const isRoot = useIsRoot(sectionId);
  const isOutput = useIsOutput(sectionId);
  const isInfo = useIsInfo(sectionId);
  const hasDescription = useSectionHasDescription(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);
  const toggleDescVis = useSectionDescription((x) => x.toggleVisible);

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  const outlineColor = isActiveSection
    ? "outline-blue-600"
    : "outline-transparent active:outline-cyan-300";

  return (
    <div
      className={`rounded-xl bg-white ${boxShadow} dndline w-min  transition-all duration-150`}
      onClick={() => setActiveSection(sectionId)}
      data-testid={`${sectionId} section core`}
    >
      <div
        className={`outline outline-4 ${outlineColor} rounded-xl border border-white bg-slate-100 shadow-md transition-all`}
        style={{ zIndex: isActiveSection ? 150 : 10 }}
      >
        <CustomResizable sectionId={sectionId}>
          <div className="h-full overflow-hidden rounded-xl">
            <div className="flex h-full flex-grow flex-col gap-2 py-4">
              <SectionHeader
                sectionId={sectionId}
                parentId={parentId}
                nextId={nextId}
                isSeriesElement={isSeriesElement}
                isRoot={isRoot}
                hasNested={hasNested}
              />
              {!isOutput && !isRoot ? (
                <InputArea sectionId={sectionId} selectedItem={selectedItem} />
              ) : (
                <OutputArea sectionId={sectionId} />
              )}
            </div>
            {!isInfo && hasDescription && (
              <div className="absolute bottom-0 flex w-full justify-center rounded-xl bg-gradient-to-t from-slate-50 py-2">
                <Button
                  grid={false}
                  twClasses="px-2 py-1 self-center text-slate-500 hover:bg-white rounded-full gap-1 font-heading uppercase border-2 border-solid border-white text-xs bg-slate-200 shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    toggleDescVis({ sectionId });
                  }}
                >
                  <BiInfoCircle className="z-[3] h-4 w-4" />
                  Info
                </Button>
              </div>
            )}
          </div>
        </CustomResizable>
      </div>
      {!isInfo && <SectionDescription sectionId={sectionId} />}
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
