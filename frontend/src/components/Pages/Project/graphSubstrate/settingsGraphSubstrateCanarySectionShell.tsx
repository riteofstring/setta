import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

export type SettingsGraphSubstrateCanarySectionShellState = {
  isDragging: boolean;
  section: SettingsGraphSubstrateCanarySceneSection;
};

export type SettingsGraphSubstrateCanarySectionShellHandle = {
  update: (nextState: SettingsGraphSubstrateCanarySectionShellState) => void;
};

type SettingsGraphSubstrateCanarySectionShellProps = {
  children: ReactNode;
  finishSectionDrag: (
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) => void;
  handleSectionPointerDown: (
    section: SettingsGraphSubstrateCanarySceneSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleSectionPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  initialState: SettingsGraphSubstrateCanarySectionShellState;
  onHoveredSectionChange: (sectionId: string | null) => void;
};

function getSettingsGraphSubstrateCanarySectionShellCursor({
  isDragging,
  section,
}: SettingsGraphSubstrateCanarySectionShellState): CSSProperties["cursor"] {
  if (section.positionAndSizeLocked) {
    return "default";
  }
  if (isDragging) {
    return "grabbing";
  }
  return "grab";
}

function applySettingsGraphSubstrateCanarySectionShellStateToElement({
  element,
  isDragging,
  section,
}: SettingsGraphSubstrateCanarySectionShellState & {
  element: HTMLDivElement;
}) {
  element.style.cursor = getSettingsGraphSubstrateCanarySectionShellCursor({
    isDragging,
    section,
  });
  element.style.transform = `translate(${section.renderedPosition.x}px,${section.renderedPosition.y}px)`;
  element.style.zIndex = `${section.tempZIndex}`;
  element.dataset.dragging = isDragging ? "true" : "false";
  element.dataset.id = section.sectionId;
  element.dataset.sectionId = section.sectionId;
}

function _SettingsGraphSubstrateCanarySectionShell(
  {
    children,
    finishSectionDrag,
    handleSectionPointerDown,
    handleSectionPointerMove,
    initialState,
    onHoveredSectionChange,
  }: SettingsGraphSubstrateCanarySectionShellProps,
  forwardedRef: React.ForwardedRef<SettingsGraphSubstrateCanarySectionShellHandle>,
) {
  const shellElementRef = useRef<HTMLDivElement | null>(null);
  const shellStateRef =
    useRef<SettingsGraphSubstrateCanarySectionShellState>(initialState);

  useLayoutEffect(() => {
    shellStateRef.current = initialState;
    const shellElement = shellElementRef.current;
    if (!shellElement) {
      return;
    }
    applySettingsGraphSubstrateCanarySectionShellStateToElement({
      element: shellElement,
      ...initialState,
    });
  }, [initialState]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      update(nextState) {
        shellStateRef.current = nextState;
        const shellElement = shellElementRef.current;
        if (!shellElement) {
          return;
        }
        applySettingsGraphSubstrateCanarySectionShellStateToElement({
          element: shellElement,
          ...nextState,
        });
      },
    }),
    [],
  );

  return (
    <div
      ref={shellElementRef}
      className="react-flow__node group/canary-section"
      style={{
        cursor: getSettingsGraphSubstrateCanarySectionShellCursor(initialState),
        touchAction: "none",
        position: "absolute",
        transform: `translate(${initialState.section.renderedPosition.x}px,${initialState.section.renderedPosition.y}px)`,
        transformOrigin: "0 0",
        pointerEvents: "all",
        visibility: "visible",
        zIndex: initialState.section.tempZIndex,
      }}
      data-id={initialState.section.sectionId}
      data-section-id={initialState.section.sectionId}
      data-dragging={initialState.isDragging ? "true" : "false"}
      data-testid="graph-substrate-canary-section"
      onPointerEnter={() =>
        onHoveredSectionChange(shellStateRef.current.section.sectionId)
      }
      onPointerLeave={() => onHoveredSectionChange(null)}
      onPointerDownCapture={(event) =>
        handleSectionPointerDown(shellStateRef.current.section, event)
      }
      onPointerMoveCapture={handleSectionPointerMove}
      onPointerUpCapture={(event) => finishSectionDrag(event, true)}
      onPointerCancelCapture={(event) => finishSectionDrag(event, false)}
    >
      {children}
    </div>
  );
}

export const SettingsGraphSubstrateCanarySectionShell = React.memo(
  forwardRef(_SettingsGraphSubstrateCanarySectionShell),
);
