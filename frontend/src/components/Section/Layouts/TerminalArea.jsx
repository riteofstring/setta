import _ from "lodash";
import React, { useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useTerminal } from "state/hooks/terminals/terminal";

function _TerminalArea({ sectionId }) {
  const { width, height } = useSectionInfos(
    (x) => x.x[sectionId].size,
    _.isEqual,
  );
  const [hasScrollbar, setHasScrollbar] = useState(false);

  return (
    <TerminalAreaReadWrite
      sectionId={sectionId}
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      setHasScrollbar={setHasScrollbar}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);

function TerminalAreaReadWrite({
  sectionId,
  width,
  height,
  hasScrollbar,
  setHasScrollbar,
}) {
  const terminalRef = useTerminal({
    sectionId,
    width,
    height,
    setHasScrollbar,
  });

  return (
    <TerminalAreaCore
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      terminalRef={terminalRef}
    />
  );
}

function TerminalAreaCore({ width, height, hasScrollbar, terminalRef }) {
  return (
    <div
      ref={terminalRef}
      className={`${hasScrollbar ? "nowheel" : ""} nodrag section-row-search-gutter section-key-value`}
      style={{ width: `${width - 24}px`, height: `${height - 32}px` }}
    />
  );
}
