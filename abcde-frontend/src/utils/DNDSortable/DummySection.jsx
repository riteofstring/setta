import React from "react";
import { useStore } from "react-flow-renderer";
import { SECTIONWIDTH } from "utils/constants";

export const DummySection = React.forwardRef((props, ref) => {
  const zoom = useStore((x) => x.transform[2]);
  return (
    <div
      style={{ width: `${SECTIONWIDTH * zoom}px`, height: `${100 * zoom}px` }}
      className="rounded-md bg-slate-50/75"
      ref={ref}
    />
  );
});
