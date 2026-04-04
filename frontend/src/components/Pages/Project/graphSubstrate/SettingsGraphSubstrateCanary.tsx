import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { selectSettingsGraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
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
  const [sectionSize, setSectionSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [viewport, setViewport] = useState<GraphViewport | null>(null);
  const wrapperDimensions = useElementDimensions(rootRef);
  const section = useProjectState(
    (state) =>
      selectSettingsGraphSubstrateCanarySection(
        state,
        useNodeInternals.getState().x,
      ),
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
    if (
      !section ||
      wrapperDimensions.width <= 0 ||
      wrapperDimensions.height <= 0
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
        x: section.layout.x,
        y: section.layout.y,
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
    wrapperDimensions,
  ]);

  const resolvedViewport = useMemo(() => {
    if (!section) {
      return viewport;
    }
    return buildInitialViewport(viewport, defaultZoomLevel, {
      x: section.layout.x,
      y: section.layout.y,
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
              transform: `translate(${section.layout.x}px,${section.layout.y}px)`,
              pointerEvents: "all",
              visibility: "visible",
              zIndex: section.layout.zIndex,
            }}
            data-id={section.sectionId}
            data-section-id={section.sectionId}
            data-testid="graph-substrate-canary-section"
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
