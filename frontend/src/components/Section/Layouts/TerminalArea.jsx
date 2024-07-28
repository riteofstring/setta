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
      className="nodrag nowheel card-terminal"
      style={{ width: `${width - 48}px`, height: `${height - 64}px` }}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);
