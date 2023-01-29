import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import { useSectionInfos } from "models/info/sectionInfos";
import { Resizable } from "re-resizable";
import { useStore } from "react-flow-renderer";
import { SECTIONWIDTH } from "utils/constants";

export function CustomResizable({ sectionId, children }) {
  const zoom = useStore((x) => x.transform[2]);
  const minHeight = useMinSectionHeight(sectionId);
  const savedSize = useSectionInfos((x) => x.x[sectionId].size);

  function onResizeStop(e, direction, ref, d) {
    useSectionInfos.getState().setSectionInfoAttr({
      sectionId,
      attr: "size",
      value: {
        width: savedSize.width + d.width,
        height: savedSize.height + d.height,
      },
    });
  }

  return (
    <Resizable
      defaultSize={savedSize}
      // minHeight={minHeight}
      minWidth={SECTIONWIDTH}
      onResizeStop={onResizeStop}
      handleWrapperClass="nodrag"
      scale={zoom}
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: true,
        bottomRight: true,
      }}
      className="flex flex-col items-stretch"
    >
      {children}
    </Resizable>
  );
}
