import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  getCurrEffectiveSectionImpl,
  debounced_route_set_top_level_section_layout,
} from "state/actions/sectionInfos";
import { addNodes, moveNodes } from "state/actions/nodeInternals";
import {
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import type { Position } from "utils/generatedTypes";
import { selectSettingsGraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  screenDeltaToWorldDelta,
  type GraphViewport,
} from "./viewportTransform";

const ROOT_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none",
  overflowAnchor: "none",
};

const INITIAL_SCREEN_PADDING_PX = 48;
const DRAG_BLOCKING_SELECTOR =
  ".nodrag,input,textarea,select,option,a,[contenteditable='true']";

type ActiveSectionDrag = {
  pointerId: number;
  sectionId: string;
  originScreenPoint: Position;
  originWorldPosition: Position;
};

type SectionPositionOverride = {
  sectionId: string;
  position: Position;
};

function buildInitialViewport(
  viewport: GraphViewport | null,
  defaultZoomLevel: number,
  sectionPosition: { x: number; y: number },
): GraphViewport {
  if (viewport) {
    return viewport;
  }
  return centerViewportOnWorldPoint(
    { x: 0, y: 0, zoom: defaultZoomLevel },
    {
      worldPoint: sectionPosition,
      screenPoint: {
        x: INITIAL_SCREEN_PADDING_PX,
        y: INITIAL_SCREEN_PADDING_PX,
      },
      zoom: defaultZoomLevel,
    },
  );
}

export function SettingsGraphSubstrateCanary() {
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<ActiveSectionDrag | null>(null);
  const lastFittedSectionIdRef = useRef<string | null>(null);
  const [sectionSize, setSectionSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [viewport, setViewport] = useState<GraphViewport | null>(null);
  const [preferredSectionId, setPreferredSectionId] = useState<string | null>(
    null,
  );
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [sectionPositionOverride, setSectionPositionOverride] =
    useState<SectionPositionOverride | null>(null);
  const wrapperDimensions = useElementDimensions(rootRef);
  const nodeInternals = useNodeInternals((state) => state.x);
  const section = useProjectState(
    (state) =>
      selectSettingsGraphSubstrateCanarySection(
        state,
        nodeInternals,
        preferredSectionId,
      ),
    _.isEqual,
  );
  const isSectionPositionLocked = useProjectState(
    (state) => {
      if (!section) {
        return false;
      }
      return getCurrEffectiveSectionImpl(state, section.sectionId)
        .positionAndSizeLocked;
    },
    _.isEqual,
  );
  const { minZoom, maxZoom, defaultZoomLevel } = useSettings(
    (state) => ({
      minZoom: state.gui.minZoom,
      maxZoom: state.gui.maxZoom,
      defaultZoomLevel: state.gui.defaultZoomLevel,
    }),
    _.isEqual,
  );

  useEffect(() => {
    if (!sectionRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0 || height <= 0) {
        return;
      }
      setSectionSize((current) => {
        if (current?.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    });

    observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
    };
  }, [section?.sectionId]);

  useEffect(() => {
    if (!section) {
      if (sectionPositionOverride !== null) {
        setSectionPositionOverride(null);
      }
      if (preferredSectionId !== null) {
        setPreferredSectionId(null);
      }
      return;
    }
    if (preferredSectionId === null) {
      setPreferredSectionId(section.sectionId);
    }
    if (
      sectionPositionOverride &&
      (sectionPositionOverride.sectionId !== section.sectionId ||
        positionsMatch(section.position, sectionPositionOverride.position))
    ) {
      setSectionPositionOverride(null);
    }
  }, [preferredSectionId, section, sectionPositionOverride]);

  useEffect(() => {
    if (
      !section ||
      wrapperDimensions.width <= 0 ||
      wrapperDimensions.height <= 0 ||
      (viewport !== null &&
        lastFittedSectionIdRef.current === section.sectionId)
    ) {
      return;
    }

    const width = sectionSize?.width ?? section.width;
    const height = sectionSize?.height ?? section.height;
    if (!width || !height) {
      return;
    }

    const nextViewport = fitViewportToWorldRect(
      {
        x: section.position.x,
        y: section.position.y,
        width,
        height,
      },
      wrapperDimensions,
      {
        minZoom,
        maxZoom,
        padding: 0.12,
      },
    );
    lastFittedSectionIdRef.current = section.sectionId;

    setViewport((current) => {
      if (
        current &&
        current.x === nextViewport.x &&
        current.y === nextViewport.y &&
        current.zoom === nextViewport.zoom
      ) {
        return current;
      }
      return nextViewport;
    });
  }, [
    maxZoom,
    minZoom,
    section,
    sectionSize?.height,
    sectionSize?.width,
    viewport,
    wrapperDimensions,
  ]);

  const resolvedViewport = useMemo(() => {
    if (!section) {
      return viewport;
    }
    return buildInitialViewport(viewport, defaultZoomLevel, {
      x: section.position.x,
      y: section.position.y,
    });
  }, [defaultZoomLevel, section, viewport]);

  useEffect(() => {
    if (!rootRef.current || !resolvedViewport) {
      return;
    }

    useReactFlow.setState({
      domNode: rootRef.current,
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      height: wrapperDimensions.height,
      transform: [
        resolvedViewport.x,
        resolvedViewport.y,
        resolvedViewport.zoom,
      ],
      width: wrapperDimensions.width,
    });
  }, [resolvedViewport, wrapperDimensions.height, wrapperDimensions.width]);

  const renderedSectionPosition =
    sectionPositionOverride?.sectionId === section?.sectionId
      ? sectionPositionOverride.position
      : section?.position ?? null;

  function handleSectionPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !section ||
      !resolvedViewport ||
      !renderedSectionPosition ||
      isSectionPositionLocked
    ) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (shouldIgnoreSectionDragTarget(event.target)) {
      return;
    }

    setPreferredSectionId(section.sectionId);
    setDraggingSectionId(section.sectionId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      sectionId: section.sectionId,
      originScreenPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      originWorldPosition: renderedSectionPosition,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSectionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const activeDrag = dragStateRef.current;
    if (
      !activeDrag ||
      !resolvedViewport ||
      activeDrag.pointerId !== event.pointerId
    ) {
      return;
    }

    const worldDelta = screenDeltaToWorldDelta(
      {
        x: event.clientX - activeDrag.originScreenPoint.x,
        y: event.clientY - activeDrag.originScreenPoint.y,
      },
      resolvedViewport,
    );
    setSectionPositionOverride({
      sectionId: activeDrag.sectionId,
      position: {
        x: activeDrag.originWorldPosition.x + worldDelta.x,
        y: activeDrag.originWorldPosition.y + worldDelta.y,
      },
    });
    event.preventDefault();
  }

  function finishSectionDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) {
    const activeDrag = dragStateRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setDraggingSectionId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (persistLayout && section && sectionPositionOverride) {
      ensureCanaryNode({
        ...section,
        position: sectionPositionOverride.position,
      });
      moveNodes([
        {
          id: sectionPositionOverride.sectionId,
          position: sectionPositionOverride.position,
        },
      ]);
      debounced_route_set_top_level_section_layout();
      return;
    }
    setSectionPositionOverride(null);
  }

  let sectionCursor: CSSProperties["cursor"] = "grab";
  if (isSectionPositionLocked) {
    sectionCursor = "default";
  } else if (draggingSectionId === section?.sectionId) {
    sectionCursor = "grabbing";
  }

  return (
    <div
      ref={rootRef}
      style={ROOT_STYLE}
      className="react-flow setta-light dark:setta-dark"
      data-testid="graph-substrate-canary"
    >
      <div
        className="react-flow__viewport"
        style={{
          transform: resolvedViewport
            ? `translate(${resolvedViewport.x}px, ${resolvedViewport.y}px) scale(${resolvedViewport.zoom})`
            : undefined,
          transformOrigin: "0 0",
        }}
      >
        {section ? (
          <div
            ref={sectionRef}
            className="react-flow__node"
            style={{
              cursor: sectionCursor,
              touchAction: "none",
              transform: renderedSectionPosition
                ? `translate(${renderedSectionPosition.x}px,${renderedSectionPosition.y}px)`
                : undefined,
              pointerEvents: "all",
              visibility: "visible",
              zIndex: section.zIndex,
            }}
            data-id={section.sectionId}
            data-section-id={section.sectionId}
            data-dragging={
              draggingSectionId === section.sectionId ? "true" : "false"
            }
            data-testid="graph-substrate-canary-section"
            onPointerDownCapture={handleSectionPointerDown}
            onPointerMoveCapture={handleSectionPointerMove}
            onPointerUpCapture={(event) => finishSectionDrag(event, true)}
            onPointerCancelCapture={(event) => finishSectionDrag(event, false)}
          >
            <SectionContainer sectionId={section.sectionId} isTopLevel={true} />
          </div>
        ) : (
          <div
            className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400"
            data-testid="graph-substrate-canary-empty"
          >
            No visible settings sections available for the graph substrate
            canary.
          </div>
        )}
      </div>
    </div>
  );
}

function shouldIgnoreSectionDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(DRAG_BLOCKING_SELECTOR));
}

function ensureCanaryNode(
  section: NonNullable<
    ReturnType<typeof selectSettingsGraphSubstrateCanarySection>
  >,
) {
  if (useNodeInternals.getState().x.has(section.sectionId)) {
    return;
  }
  addNodes([
    {
      id: section.sectionId,
      position: section.position,
      width: section.width,
      height: section.height,
      zIndex: section.zIndex,
      tempZIndex: section.zIndex,
    },
  ]);
}

function positionsMatch(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

function useElementDimensions(ref: RefObject<HTMLDivElement>) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setDimensions((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    });

    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return dimensions;
}
