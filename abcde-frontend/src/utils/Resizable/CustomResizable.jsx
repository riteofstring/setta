import { useMinSectionHeight } from "hooks/useMinSectionHeight";
import { Resizable } from "re-resizable";
import { useStore } from "react-flow-renderer";
import { SECTIONWIDTH } from "utils/constants";

export function CustomResizable({ sectionId, children }) {
  const zoom = useStore((x) => x.transform[2]);
  const minHeight = useMinSectionHeight(sectionId);
  const className = "nodrag";

  return (
    <Resizable
      defaultSize={{ width: SECTIONWIDTH }}
      minHeight={minHeight}
      minWidth={SECTIONWIDTH}
      handleWrapperClass={className}
      scale={zoom}
      className="flex"
    >
      {children}
    </Resizable>
  );
}
