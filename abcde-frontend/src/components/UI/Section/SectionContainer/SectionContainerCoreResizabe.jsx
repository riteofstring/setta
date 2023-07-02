import { useSectionInfos } from "models/info/sectionInfos";
import { useState } from "react";
import { BiInfoCircle } from "react-icons/bi";
import { Button } from "utils/atoms/buttons/Button";
import { CustomResizable } from "utils/Resizable/CustomResizable";
import "./dndline.css";
import { SectionHeader } from "./Header/SectionHeader";
import { InputArea } from "./InputArea";
import { SectionDescription } from "./Main/SectionDescription/SectionDescription";
import { OutputArea } from "./OutputArea";
import { SocialArea } from "./SocialArea";
import { UserSpecifiedObjectArea } from "./UserSpecifiedObjectArea";

export function SectionContainerCoreResizable({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  isOutput,
  isSocial,
  isInfo,
  isUserSpecifiedObject,
  hasNested,
  hasDescription,
  isActiveSection,
  toggleDescVis,
}) {
  const width = useSectionInfos((x) => x.x[sectionId].size.width);
  const [localWidth, setLocalWidth] = useState(width);

  const outlineColor = isActiveSection
    ? "outline-blue-600"
    : "outline-transparent active:outline-cyan-300";

  return (
    <>
      <div
        className={`outline outline-4 ${outlineColor} rounded-xl border border-white bg-slate-100 shadow-md transition-all`}
        style={{ zIndex: isActiveSection ? 150 : 10 }}
      >
        <CustomResizable sectionId={sectionId} setLocalWidth={setLocalWidth}>
          <div className="h-full overflow-hidden rounded-xl">
            <div
              className={`flex h-full flex-grow flex-col gap-2 py-4 ${
                hasDescription && "mb-11"
              }`}
            >
              <SectionHeader
                sectionId={sectionId}
                parentId={parentId}
                nextId={nextId}
                isSeriesElement={isSeriesElement}
                isRoot={isRoot}
                hasNested={hasNested}
                isActiveSection={isActiveSection}
              />
              <AreaSwitch
                sectionId={sectionId}
                isOutput={isOutput}
                isSocial={isSocial}
                isRoot={isRoot}
                isInfo={isInfo}
                isUserSpecifiedObject={isUserSpecifiedObject}
              />
            </div>
            {!isInfo && hasDescription && (
              <div className="absolute bottom-0 flex w-full justify-center rounded-xl bg-gradient-to-t from-slate-50 py-2">
                <Button
                  grid={false}
                  twClasses="px-2 py-1 self-center text-slate-500 hover:bg-white rounded-full gap-1 font-heading uppercase border-2 border-solid border-white text-xs bg-slate-200 shadow-sm hover:shadow-md transition-all"
                  onClick={toggleDescVis}
                >
                  <BiInfoCircle className="z-[3] h-4 w-4" />
                  Info
                </Button>
              </div>
            )}
          </div>
        </CustomResizable>
      </div>
      {!isInfo && (
        <SectionDescription sectionId={sectionId} width={localWidth} />
      )}
    </>
  );
}

function AreaSwitch({
  sectionId,
  isOutput,
  isSocial,
  isRoot,
  isInfo,
  isUserSpecifiedObject,
}) {
  if (isOutput) {
    return <OutputArea sectionId={sectionId} />;
  }
  if (isSocial) {
    return <SocialArea sectionId={sectionId} />;
  }
  if (isInfo) {
    return <SectionDescription sectionId={sectionId} card={true} />;
  }
  if (isUserSpecifiedObject) {
    return <UserSpecifiedObjectArea sectionId={sectionId} />;
  }
  if (!isRoot) {
    return <InputArea sectionId={sectionId} />;
  }
}
