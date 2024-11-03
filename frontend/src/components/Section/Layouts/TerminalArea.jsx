import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import { useSectionInfos } from "state/definitions";
import { useTerminal } from "state/hooks/terminal";

function _TerminalArea({ sectionId }) {
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);
  const terminalRef = useTerminal({ sectionId, width, height });
  window.reactFlowZoom = useReactFlow((x) => x.transform[2]);

  return (
    <div
      ref={terminalRef}
      className="nodrag nowheel section-row-search-gutter section-key-value"
      style={{ width: `${width - 24}px`, height: `${height - 32}px` }}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);
