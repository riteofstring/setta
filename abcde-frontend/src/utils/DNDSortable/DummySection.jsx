import React from "react";
import { SECTIONWIDTH } from "utils/constants";

export const DummySection = React.forwardRef(({ zoom }, ref) => {
  return (
    <div
      style={{ width: `${SECTIONWIDTH * zoom}px`, height: `${100 * zoom}px` }}
      className="bg-gray-50/75 rounded-md"
      ref={ref}
    />
  );
});
