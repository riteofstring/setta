import React, {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SettingsGraphSubstrateCanaryBackground } from "./settingsGraphSubstrateCanaryBackground";
import { useSettingsGraphSubstrateCanaryController } from "./settingsGraphSubstrateCanaryController";
import {
  createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot,
  measureSettingsGraphSubstrateCanaryMotionAttribution,
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "./settingsGraphSubstrateCanaryInstrumentation";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual,
  areSettingsGraphSubstrateCanarySectionIdSetsEqual,
  resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds,
  resolveSettingsGraphSubstrateCanaryPresentedSceneSections,
  resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect,
} from "./settingsGraphSubstrateCanarySectionPresentation";
import { SettingsGraphSubstrateCanarySectionShellPixiLayer } from "./settingsGraphSubstrateCanarySectionShellPixiLayer";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";

const ROOT_STYLE: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  position: "absolute",
  userSelect: "none",
  overflowAnchor: "none",
};

type SettingsGraphSubstrateCanaryPresentedSectionsProps = {
  draggingSectionId: string | null;
  mountedSectionBodyIds: ReadonlySet<string>;
  onHoveredSectionChange: (sectionId: string | null) => void;
  onSectionsLayerRender: (
    id: string,
    phase: "mount" | "nested-update" | "update",
    actualDuration: number,
  ) => void;
  presentedSceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionDragController: ReturnType<
    typeof useSettingsGraphSubstrateCanaryController
  >["sectionDragController"];
};

function _SettingsGraphSubstrateCanaryPresentedSections({
  draggingSectionId,
  mountedSectionBodyIds,
  onHoveredSectionChange,
  onSectionsLayerRender,
  presentedSceneSections,
  sectionDragController,
}: SettingsGraphSubstrateCanaryPresentedSectionsProps) {
  return (
    <Profiler
      id="settings-graph-substrate-canary-sections-layer"
      onRender={onSectionsLayerRender}
    >
      <SettingsGraphSubstrateCanarySectionsLayer
        draggingSectionId={draggingSectionId}
        mountedSectionBodyIds={mountedSectionBodyIds}
        onHoveredSectionChange={onHoveredSectionChange}
        presentedSceneSections={presentedSceneSections}
        sectionDragController={sectionDragController}
      />
    </Profiler>
  );
}

const SettingsGraphSubstrateCanaryPresentedSections = React.memo(
  _SettingsGraphSubstrateCanaryPresentedSections,
  (previousProps, nextProps) =>
    previousProps.draggingSectionId === nextProps.draggingSectionId &&
    previousProps.mountedSectionBodyIds === nextProps.mountedSectionBodyIds &&
    previousProps.onHoveredSectionChange === nextProps.onHoveredSectionChange &&
    previousProps.onSectionsLayerRender === nextProps.onSectionsLayerRender &&
    previousProps.presentedSceneSections === nextProps.presentedSceneSections &&
    previousProps.sectionDragController === nextProps.sectionDragController,
);

export function SettingsGraphSubstrateCanary() {
  const controller = useSettingsGraphSubstrateCanaryController();
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const stablePresentedSceneSectionsRef = useRef<
    Array<SettingsGraphSubstrateCanarySceneSection>
  >([]);
  const stableMountedSectionBodyIdsRef = useRef<Set<string>>(new Set());
  const handleHoveredSectionChange = useCallback((sectionId: string | null) => {
    setHoveredSectionId((currentSectionId) => {
      return currentSectionId === sectionId ? currentSectionId : sectionId;
    });
  }, []);
  const handleSectionsLayerRender = useCallback(
    (
      _id: string,
      _phase: "mount" | "nested-update" | "update",
      actualDuration: number,
    ) => {
      recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
        "presentedSceneSectionSubtreeReactRender",
        actualDuration,
      );
    },
    [],
  );
  const visibleViewportWorldRect = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
      viewport: controller.resolvedViewport,
      visibleViewportRect: controller.visibleViewportRect,
    });
  }, [controller.resolvedViewport, controller.visibleViewportRect]);
  const presentedSceneSections = useMemo(() => {
    const nextPresentedSceneSections =
      resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
        draggingSectionId: controller.draggingSectionId,
        sceneSections: controller.sceneSections,
        viewport: controller.resolvedViewport,
        visibleViewportRect: controller.visibleViewportRect,
      });
    const shouldReusePresentedSceneSections =
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "presentedSceneSectionArrayReuseCheck",
        () =>
          areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
            stablePresentedSceneSectionsRef.current,
            nextPresentedSceneSections,
          ),
      );
    if (shouldReusePresentedSceneSections) {
      return stablePresentedSceneSectionsRef.current;
    }
    stablePresentedSceneSectionsRef.current = nextPresentedSceneSections;
    return nextPresentedSceneSections;
  }, [
    controller.draggingSectionId,
    controller.sceneSections,
    controller.resolvedViewport,
    controller.visibleViewportRect,
  ]);
  const mountedSectionBodyIds = useMemo(() => {
    const nextMountedSectionBodyIds =
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "presentedSceneBodyMountFilter",
        () =>
          resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds({
            draggingSectionId: controller.draggingSectionId,
            presentedSceneSections,
            viewport: controller.resolvedViewport,
            visibleViewportRect: controller.visibleViewportRect,
            visibleViewportWorldRect,
          }),
      );
    const shouldReuseMountedSectionBodyIds =
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "mountedSectionBodyIdSetReuseCheck",
        () =>
          areSettingsGraphSubstrateCanarySectionIdSetsEqual(
            stableMountedSectionBodyIdsRef.current,
            nextMountedSectionBodyIds,
          ),
      );
    if (shouldReuseMountedSectionBodyIds) {
      return stableMountedSectionBodyIdsRef.current;
    }
    stableMountedSectionBodyIdsRef.current = nextMountedSectionBodyIds;
    return nextMountedSectionBodyIds;
  }, [
    controller.draggingSectionId,
    controller.resolvedViewport,
    controller.visibleViewportRect,
    presentedSceneSections,
    visibleViewportWorldRect,
  ]);
  const presentedSectionIds = useMemo(
    () => new Set(presentedSceneSections.map((section) => section.sectionId)),
    [presentedSceneSections],
  );

  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mounted: true,
    });
    return () => {
      updateSettingsGraphSubstrateCanaryInstrumentationSnapshot(
        createEmptySettingsGraphSubstrateCanaryInstrumentationSnapshot(),
      );
    };
  }, []);

  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mountedSectionBodyCount: mountedSectionBodyIds.size,
    });
  }, [mountedSectionBodyIds]);

  useEffect(() => {
    if (
      hoveredSectionId !== null &&
      !presentedSectionIds.has(hoveredSectionId)
    ) {
      setHoveredSectionId(null);
    }
  }, [hoveredSectionId, presentedSectionIds]);

  return (
    <div
      ref={controller.rootRef}
      style={{
        ...ROOT_STYLE,
        cursor: controller.rootCursor,
      }}
      className="react-flow setta-light dark:setta-dark"
      data-tab-scope="canvas"
      data-testid="graph-substrate-canary"
      onClick={controller.handlePaneClick}
      onPointerDown={controller.handlePanePointerDown}
      onPointerMove={controller.handlePanePointerMove}
      onPointerUp={controller.finishPanePan}
      onPointerCancel={controller.finishPanePan}
      onWheel={controller.handlePaneWheel}
    >
      {controller.shouldShowGridLines && (
        <SettingsGraphSubstrateCanaryBackground
          viewport={controller.resolvedViewport}
        />
      )}
      {controller.sceneSections.length > 0 ? (
        <SettingsGraphSubstrateCanarySectionShellPixiLayer
          draggingSectionId={controller.draggingSectionId}
          hoveredSectionId={hoveredSectionId}
          presentedSceneSections={presentedSceneSections}
          sceneSections={controller.sceneSections}
          visibleViewportRect={controller.visibleViewportRect}
          viewport={controller.resolvedViewport}
        />
      ) : null}
      <div
        className="react-flow__viewport"
        data-testid="graph-substrate-canary-viewport"
        style={{
          backfaceVisibility: "hidden",
          contain: "layout paint style",
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          transform: controller.viewportTransform,
          transformOrigin: "0 0",
          willChange: "transform",
          zIndex: 2,
        }}
      >
        {controller.sceneSections.length > 0 ? (
          <SettingsGraphSubstrateCanaryPresentedSections
            draggingSectionId={controller.draggingSectionId}
            mountedSectionBodyIds={mountedSectionBodyIds}
            onHoveredSectionChange={handleHoveredSectionChange}
            onSectionsLayerRender={handleSectionsLayerRender}
            presentedSceneSections={presentedSceneSections}
            sectionDragController={controller.sectionDragController}
          />
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
