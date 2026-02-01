import _ from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useTerminal } from "state/hooks/terminals/terminal";
import { NO_PAN_CLASS_NAME } from "utils/constants";

function _TerminalArea({ sectionId }) {
  const { width, height } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.size;
  }, _.isEqual);
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

type EmbeddedTerminalAreaProps = {
  sectionId: string;
  className?: string;
};

function _EmbeddedTerminalArea({
  sectionId,
  className = "",
}: EmbeddedTerminalAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const loggedSizeRef = useRef(false);
  const disablePointerEvents = useShouldDisablePointerEvents();

  useEffect(() => {
    console.info(
      JSON.stringify({
        event: "embedded-terminal-mounted",
        sectionId,
      }),
    );
    return () => {
      console.info(
        JSON.stringify({
          event: "embedded-terminal-unmounted",
          sectionId,
        }),
      );
    };
  }, [sectionId]);

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
  useEffect(() => {
    if (width <= 0 || height <= 0 || loggedSizeRef.current) {
      return;
    }
    loggedSizeRef.current = true;
    console.info(
      JSON.stringify({
        event: "embedded-terminal-sized",
        sectionId,
        width,
        height,
      }),
    );
  }, [height, sectionId, width]);
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
      className={`${hasScrollbar ? "nowheel" : ""} ${NO_PAN_CLASS_NAME} nodrag section-row-search-gutter section-key-value`}
      data-section-main-editor
      style={{ width: `${width - 24}px`, height: `${height - 32}px` }}
    />
  );
}
