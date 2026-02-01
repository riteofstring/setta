import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import {
  getCurrEffectiveSectionImpl,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
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

type EmbeddedTerminalAreaProps = {
  sectionId: string;
  className?: string;
};

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

function _EmbeddedTerminalArea({
  sectionId,
  className = "",
}: EmbeddedTerminalAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const disablePointerEvents = useShouldDisablePointerEvents();

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = Math.floor(entry.contentRect.width);
      const nextHeight = Math.floor(entry.contentRect.height);
      setDimensions((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const width = Math.max(0, dimensions.width);
  const height = Math.max(0, dimensions.height);
  const terminalRef = useTerminal({
    sectionId,
    width,
    height,
    setHasScrollbar,
  });

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-setta-950/95 p-2 dark:border-setta-800 ${className}`}
      data-attached-terminal-section-id={sectionId}
    >
      <div
        ref={terminalRef}
        className={`${hasScrollbar ? "nowheel" : ""} ${NO_PAN_CLASS_NAME} nodrag h-full w-full ${disablePointerEvents ? "pointer-events-none select-none" : ""}`}
        data-section-main-editor
      />
    </div>
  );
}

export const EmbeddedTerminalArea = React.memo(_EmbeddedTerminalArea);

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
