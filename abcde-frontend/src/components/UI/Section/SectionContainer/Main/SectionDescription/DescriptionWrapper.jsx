import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function DescriptionWrapper({ sectionId, descVis, children }) {
  return (
    <>
      <ResizableDescription sectionId={sectionId} descVis={descVis}>
        <div className="m-8 w-min flex-1 self-stretch overflow-y-scroll [&_.prose]:p-0">
          {children}
        </div>
      </ResizableDescription>
    </>
  );
}
