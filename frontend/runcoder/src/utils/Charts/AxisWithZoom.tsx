import React from "react";
import { useStore } from "xyflow/core";

// This is a hack to fix the bug where tick labels change size unexpectedly when zoomed in or out.
// It works by rerendering the child (the axis) every time the zoom level changes.
// Rerendering is triggered by changing the key
export function AxisWithZoom({ children, childKey }) {
  const zoom = useStore((x) => x.transform[2]);
  return React.cloneElement(children, {
    key: `${childKey}-${zoom}`,
  });
}
