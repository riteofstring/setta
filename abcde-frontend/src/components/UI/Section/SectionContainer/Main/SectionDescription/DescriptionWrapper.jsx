import { VscGrabber } from "react-icons/vsc";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function DescriptionWrapper({ sectionId, descVis, children }) {
  return (
    <>
      <ResizableDescription sectionId={sectionId} descVis={descVis}>
        <div className="m-8 w-min flex-1 self-stretch overflow-y-scroll [&_.prose]:p-0">
          {children}
        </div>
        {descVis && (
          <VscGrabber className="absolute bottom-0 left-1/2 z-0 mx-auto mb-3 -translate-x-1/2 select-none text-slate-400" />
        )}
      </ResizableDescription>
    </>
  );
}
