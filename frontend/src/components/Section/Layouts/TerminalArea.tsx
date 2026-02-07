import _ from "lodash";
import React, { useState } from "react";
import {
  getCurrEffectiveSectionImpl,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTerminal } from "state/hooks/terminals/terminal";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";

function _TerminalArea({ sectionId }) {
  const { width, height, isAttachedTerminalChild } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const parentId = x.parentSectionMap[sectionId] ?? null;
    let attachedTerminalChild = false;
    if (parentId) {
      const parentImpl = getCurrEffectiveSectionImpl(x, parentId);
      attachedTerminalChild =
        impl.type === SectionTypeEnum.Terminal &&
        isBaseCodeSectionType(parentImpl.type) &&
        parentImpl.attachedTerminalSectionId === sectionId;
    }
    return { ...impl.size, isAttachedTerminalChild: attachedTerminalChild };
  }, _.isEqual);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  return (
    <TerminalAreaReadWrite
      sectionId={sectionId}
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      setHasScrollbar={setHasScrollbar}
      dataAttachedTerminalId={isAttachedTerminalChild ? sectionId : null}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);

type TerminalAreaReadWriteProps = {
  sectionId: string;
  width: number;
  height: number;
  hasScrollbar: boolean;
  setHasScrollbar: (value: boolean) => void;
  dataAttachedTerminalId: string | null;
};

type TerminalAreaCoreProps = {
  width: number;
  height: number;
  hasScrollbar: boolean;
  terminalRef: React.RefObject<HTMLDivElement>;
  dataAttachedTerminalId: string | null;
};

function TerminalAreaReadWrite({
  sectionId,
  width,
  height,
  hasScrollbar,
  setHasScrollbar,
  dataAttachedTerminalId,
}: TerminalAreaReadWriteProps) {
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
      dataAttachedTerminalId={dataAttachedTerminalId}
    />
  );
}

function TerminalAreaCore({
  width,
  height,
  hasScrollbar,
  terminalRef,
  dataAttachedTerminalId,
}: TerminalAreaCoreProps) {
  return (
    <div
      ref={terminalRef}
      className={`${hasScrollbar ? "nowheel" : ""} ${NO_PAN_CLASS_NAME} nodrag section-row-search-gutter section-key-value`}
      data-section-main-editor
      data-attached-terminal-section-id={dataAttachedTerminalId ?? undefined}
      style={{ width: `${width - 24}px`, height: `${height - 32}px` }}
    />
  );
}
