import type {
  DirectorEvent,
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  Workstream,
  WorkstreamNarration,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";

import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import { useWorkspaceStore } from "../../stores/workspace-store";
import {
  AppShellSpeechCaptureEffectLifetime,
  subscribeSpeechCapabilityRefresh,
} from "../global-speech/speech-capture-lifecycle";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import { createBrowserVoiceInputProvider } from "../global-speech/browser-voice-input-provider";
import { DirectorGraphSurface } from "../director-graph/render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../director-graph/render/director-graph-canvas";
import type { GraphArtifactParticleStyle } from "../director-graph/render/graph-artifact-presentation";
import type { GraphViewport } from "../director-graph/render/graph-view-state";
import {
  DirectorComposer,
  directorComposerInputId,
  directorComposerTakesKeystroke,
  focusDirectorComposer,
  type DirectorSpeechCaptureBinding,
} from "./DirectorComposer";
import { applyDirectorEvent, selectedWorkstreamEntry } from "./director-command-center-state";
import { enqueueDirectorSpeechPlayback } from "./director-speech-playback";
import { DirectorSpeechCaptureController } from "./director-speech-capture";
import { ArtifactBrowserSurfaceSlot } from "./ArtifactBrowserSurfaceSlot";
import { ArtifactsRail } from "./DirectorArtifactsRail";
import {
  DirectorGraphDevPanel,
  directorGraphDevPanelId,
  directorGraphDevShortcut,
} from "./DirectorGraphDevPanel";
import { PendingActions } from "./DirectorPendingActions";
import { NowRail } from "./DirectorNowRail";
import { DirectorReply, type DirectorLoadState } from "./DirectorReply";
import { useDirectorArtifactBrowser } from "./director-artifact-browser";
import {
  useDirectorWorkstreamSwitchTransition,
  type DirectorWorkstreamSwitchDirection,
} from "./director-workstream-switch-transition";
import { directorFocus, type DirectorFocus } from "./director-focus";
import { readGraphLabelsVisible, writeGraphLabelsVisible } from "./director-graph-label-preference";
import { directorSubmitIntent } from "./director-view-submit";
import {
  CompactWorkstreamNavigation,
  CommandCenterTopBar,
  directorWorkstreamKeyboardDirection,
  moveSelectionIntent,
  type DirectorRailVisibility,
} from "./DirectorWorkstreamNavigation";
import {
  directorGraphLaneId,
  directorGraphTimeSecondsAt,
  packDirectorGraphs,
  useDirectorGraphPresentation,
} from "./director-graph-presentation";
import {
  createDirectorGraphDevScenario,
  createDirectorGraphDevSimulation,
  createDirectorGraphDevTimeline,
  directorGraphDevCycleDurationSeconds,
  directorGraphDevDefaultNodeCount,
  directorGraphDevDefaultSpeed,
  directorGraphDevFrameIndexAt,
  directorGraphDevFrameStepSeconds,
  directorGraphDevThreadPhaseCount,
  directorGraphDevTimeInCycle,
  rescheduleDirectorGraphDevTimeline,
  type DirectorGraphDevNodeCount,
  type DirectorGraphDevRunningSpeed,
  type DirectorGraphDevSpeed,
  type DirectorGraphDevThreadCount,
  type DirectorGraphDevTimeline,
} from "./director-graph-dev-simulation";

interface DirectorCommandCenterShellProps {
  connectedRuntimeId: string | null;
  onOpenVoiceCredentialSettings: () => void;
  onOpenSettingsPage: () => void;
  platform: DesktopPlatform;
  setta: SettaAPI;
  speechPlayback: AppShellSpeechPlaybackController;
}

/**
 * What the shell is waiting on, kept apart because the two wait differently.
 *
 * A submitted request is a turn of the Director conversation, which the
 * conversation itself orders; it can run for as long as the model takes. A
 * direct command is a single durable write. Folding both into one busy flag
 * would let a slow Director turn lock the artifact rail's approvals, and would
 * shut the app's front door for the whole time the Director was answering.
 */
interface DirectorPendingWork {
  readonly answering: boolean;
  readonly dispatching: boolean;
}

type DirectorPendingKind = "answering" | "command" | "none";

interface DirectorSubmitQueue {
  readonly epoch: symbol;
  tail: Promise<void>;
}

interface DirectorRuntimeState {
  readonly loadState: DirectorLoadState;
  readonly message: string | null;
  readonly pending: DirectorPendingWork;
  readonly receiptText: string | null;
  readonly snapshot: DirectorSnapshot | null;
}

interface DirectorCommandCenterSnapshotView {
  readonly narration: readonly WorkstreamNarration[];
  readonly approvals: readonly DirectorSnapshot["unresolvedApprovals"][number][];
  readonly artifacts: readonly DirectorSnapshot["artifacts"][number][];
  readonly requests: readonly DirectorSnapshot["unresolvedResourceRequests"][number][];
  readonly selectedWorkstream: Workstream | null;
}

type DirectorCompactRail = "artifacts" | "now" | null;

const defaultRailVisibility = {
  artifacts: true,
  now: true,
} as const satisfies DirectorRailVisibility;

/*
 * The width at which a rail stops flanking the canvas and becomes a card laid
 * over it. Below it the two rails would cover each other, so opening one closes
 * the other. The same breakpoint draws the compact layout in
 * `director-command-center.css`; the state machine and the layout have to agree
 * on when a rail floats.
 */
const compactRailQuery = "(max-width: 760px)";
const directorGraphDevToolsEnabled = import.meta.env.DEV;

interface DirectorGraphDevClock {
  readonly animationAnchorSeconds: number;
  readonly speed: DirectorGraphDevSpeed;
  readonly timeline: DirectorGraphDevTimeline;
  readonly virtualAnchorSeconds: number;
  readonly wallAnchorMs: number;
}

type DirectorGraphDevSimulation = ReturnType<typeof createDirectorGraphDevSimulation>;

interface DirectorGraphComposition {
  readonly presentation: "conversation" | "columns" | "grid";
  readonly snapshot: NonNullable<DirectorGraphDevSimulation>["snapshot"];
}

interface PreviousDirectorGraphComposition {
  readonly canvas: DirectorGraphCanvas;
  readonly devFrameKey: string | null;
  readonly devNodeCount: DirectorGraphDevNodeCount;
  readonly devThreadCount: DirectorGraphDevThreadCount | null;
  readonly graphs: DirectorSnapshot["graphs"] | undefined;
  readonly presentation: DirectorGraphComposition["presentation"];
  readonly snapshotEdgeCount: number;
  readonly snapshotNodeCount: number;
  readonly selectedWorkstreamId: string | null;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

function directorGraphCanvasSelfWorkstreamId(
  simulation: DirectorGraphDevSimulation | null,
  selectedWorkstreamId: string | null,
): string | null {
  return simulation !== null || selectedWorkstreamId === null ? directorGraphLaneId : null;
}

function sameDirectorGraphComposition(
  previous: PreviousDirectorGraphComposition | null,
  next: PreviousDirectorGraphComposition,
): boolean {
  return (
    previous !== null &&
    previous.canvas === next.canvas &&
    previous.devFrameKey === next.devFrameKey &&
    previous.devNodeCount === next.devNodeCount &&
    previous.devThreadCount === next.devThreadCount &&
    previous.graphs === next.graphs &&
    previous.presentation === next.presentation &&
    previous.selectedWorkstreamId === next.selectedWorkstreamId
  );
}

function sameDirectorGraphViewport(
  previous: PreviousDirectorGraphComposition | null,
  next: PreviousDirectorGraphComposition,
): boolean {
  return (
    previous?.viewportWidth === next.viewportWidth &&
    previous.viewportHeight === next.viewportHeight
  );
}

function sameDirectorGraphTopology(
  previous: PreviousDirectorGraphComposition | null,
  next: PreviousDirectorGraphComposition,
): boolean {
  return (
    previous?.snapshotNodeCount === next.snapshotNodeCount &&
    previous.snapshotEdgeCount === next.snapshotEdgeCount
  );
}

function applyDirectorGraphSnapshot(
  canvas: DirectorGraphCanvas,
  snapshot: DirectorGraphComposition["snapshot"],
  sameGraph: boolean,
  sameViewport: boolean,
  sameTopology: boolean,
): void {
  const viewportOnly = sameGraph && !sameViewport;
  if (viewportOnly && sameTopology) {
    canvas.reflowSnapshot(snapshot);
    return;
  }
  if (!sameGraph || viewportOnly) {
    // Crossing the grid's fit boundary changes each worker from a short trail
    // to one activity node. That is a real projection transition, not a pure
    // coordinate reflow, so let the canvas retarget it smoothly.
    canvas.setSnapshot(snapshot);
  }
}

function directorGraphLayoutSignature(
  simulation: DirectorGraphDevSimulation | null,
  composition: DirectorGraphComposition,
): string {
  const source =
    simulation === null ? "live" : `dev:${simulation.threadCount}:${simulation.nodeCount}`;
  return [source, composition.presentation, composition.snapshot.turnCount].join(":");
}

function applyDirectorGraphCanvasComposition({
  canvas,
  composition,
  devNodeCount,
  devThreadCount,
  graphViewport,
  previous,
  previousLayoutSignature,
  selectedWorkstreamId,
  simulation,
  snapshotGraphs,
}: {
  readonly canvas: DirectorGraphCanvas;
  readonly composition: DirectorGraphComposition;
  readonly devNodeCount: DirectorGraphDevNodeCount;
  readonly devThreadCount: DirectorGraphDevThreadCount | null;
  readonly graphViewport: GraphViewport;
  readonly previous: PreviousDirectorGraphComposition | null;
  readonly previousLayoutSignature: string | undefined;
  readonly selectedWorkstreamId: string | null;
  readonly simulation: DirectorGraphDevSimulation | null;
  readonly snapshotGraphs: DirectorSnapshot["graphs"] | undefined;
}): {
  readonly layoutSignature: string;
  readonly next: PreviousDirectorGraphComposition;
} {
  canvas.setPresentation(
    composition.presentation,
    directorGraphCanvasSelfWorkstreamId(simulation, selectedWorkstreamId),
  );
  const next = {
    canvas,
    devFrameKey: simulation?.frameKey ?? null,
    devNodeCount,
    devThreadCount,
    graphs: snapshotGraphs,
    presentation: composition.presentation,
    selectedWorkstreamId,
    snapshotEdgeCount: composition.snapshot.edgeCount,
    snapshotNodeCount: composition.snapshot.nodeCount,
    viewportHeight: graphViewport.height,
    viewportWidth: graphViewport.width,
  } satisfies PreviousDirectorGraphComposition;
  applyDirectorGraphSnapshot(
    canvas,
    composition.snapshot,
    sameDirectorGraphComposition(previous, next),
    sameDirectorGraphViewport(previous, next),
    sameDirectorGraphTopology(previous, next),
  );
  const layoutSignature = directorGraphLayoutSignature(simulation, composition);
  if (previousLayoutSignature !== undefined && previousLayoutSignature !== layoutSignature) {
    canvas.playLayoutTransition();
  }
  return { layoutSignature, next };
}

function selectedDirectorWorkstreamId(snapshot: DirectorSnapshot | null): string | null {
  return snapshot === null ? null : snapshot.selectedWorkstreamId;
}

function initialDirectorGraphViewport(): GraphViewport {
  return {
    height: Math.max(1, globalThis.window?.innerHeight ?? 1024),
    width: Math.max(1, globalThis.window?.innerWidth ?? 800),
  };
}

function directorSnapshotGraphs(
  snapshot: DirectorSnapshot | null,
): DirectorSnapshot["graphs"] | undefined {
  return snapshot === null ? undefined : snapshot.graphs;
}

function directorGraphTimeSource(
  simulation: DirectorGraphDevSimulation | null,
  live: (timestampMs: number) => number,
): (timestampMs: number) => number {
  return simulation?.timeSecondsAt ?? live;
}

function directorGraphIsLoading(loadState: DirectorLoadState): boolean {
  return loadState === "loading" || loadState === "resyncing";
}

function directorOptionalBoolean(value: boolean): true | undefined {
  return value || undefined;
}

function directorBooleanDataAttribute(value: boolean): "true" | undefined {
  return value ? "true" : undefined;
}

function directorArtifactViewAttribute(active: boolean): "true" | undefined {
  return directorBooleanDataAttribute(active);
}

function directorGraphSimulationSpeedAttribute(
  simulation: DirectorGraphDevSimulation | null,
  speed: DirectorGraphDevSpeed,
): DirectorGraphDevSpeed | undefined {
  return simulation === null ? undefined : speed;
}

function directorGraphDevDescription(simulation: DirectorGraphDevSimulation | null): string {
  return simulation?.description ?? "Live data · production projection";
}

function directorRailLayoutAttribute(floating: boolean): "floating" | "flanking" {
  return floating ? "floating" : "flanking";
}

function directorSwitchDirectionAttribute(
  direction: DirectorWorkstreamSwitchDirection | null,
): DirectorWorkstreamSwitchDirection | undefined {
  return direction ?? undefined;
}

function directorGraphOpenWorkstreamHandler(
  simulation: DirectorGraphDevSimulation | null,
  openWorkstream: (workstreamId: string) => void,
): ((workstreamId: string) => void) | undefined {
  return simulation === null ? openWorkstream : undefined;
}

function directorWorkstreamStatus(workstream: Workstream | null): Workstream["status"] | null {
  return workstream?.status ?? null;
}

function directorGraphDevTopBarTools({
  active,
  onToggle,
  open,
  triggerRef,
}: {
  readonly active: boolean;
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly triggerRef: ComponentProps<typeof DirectorGraphDevPanel>["triggerRef"];
}): ComponentProps<typeof CommandCenterTopBar>["graphDevTools"] {
  if (!directorGraphDevToolsEnabled) {
    return null;
  }
  return {
    active,
    keyShortcuts: directorGraphDevShortcut,
    onToggle,
    open,
    panelId: directorGraphDevPanelId,
    triggerRef,
  };
}

function DirectorGraphEmptyStateSlot({
  focus,
  loadState,
  nodeCount,
}: {
  readonly focus: DirectorFocus;
  readonly loadState: DirectorLoadState;
  readonly nodeCount: number;
}): React.JSX.Element | null {
  if (loadState !== "ready" || nodeCount !== 0) {
    return null;
  }
  return <GraphEmptyState focus={focus} />;
}

function DirectorGraphDevPanelSlot({
  enabled,
  panel,
}: {
  readonly enabled: boolean;
  readonly panel: ComponentProps<typeof DirectorGraphDevPanel>;
}): React.JSX.Element | null {
  if (!enabled) {
    return null;
  }
  return <DirectorGraphDevPanel {...panel} />;
}

function directorGraphDevEventSecondsAt(
  clock: DirectorGraphDevClock,
  timestampMs: number,
  nodeCount: DirectorGraphDevNodeCount,
): number {
  return directorGraphDevTimeInCycle(
    clock.virtualAnchorSeconds + ((timestampMs - clock.wallAnchorMs) / 1000) * clock.speed,
    nodeCount,
  );
}

function directorGraphDevAnimationSecondsAt(
  clock: DirectorGraphDevClock,
  timestampMs: number,
): number {
  return clock.animationAnchorSeconds + (timestampMs - clock.wallAnchorMs) / 1000;
}

function directorGraphDevScheduledSpeed(
  timeline: DirectorGraphDevTimeline,
): DirectorGraphDevRunningSpeed {
  const latest = timeline[timeline.length - 1];
  if (latest === undefined) {
    throw new Error("graph simulator timeline requires a scheduled speed");
  }
  return latest.speed;
}

function resetDirectorGraphDevClock(
  speed: DirectorGraphDevSpeed,
  wallAnchorMs: number,
  scheduledSpeed: DirectorGraphDevRunningSpeed,
): DirectorGraphDevClock {
  return {
    animationAnchorSeconds: 0,
    speed,
    timeline: createDirectorGraphDevTimeline(scheduledSpeed),
    virtualAnchorSeconds: 0,
    wallAnchorMs,
  };
}
const directorEventVisibility = {
  "director.aggregates.updated": true,
  "director.approval.updated": true,
  "director.artifact.updated": true,
  "director.graph.updated": true,
  "director.resync_required": true,
  "director.resource_request.updated": true,
  "director.selection.changed": true,
  "director.text.delta": false,
  "director.workstream.removed": true,
  "director.workstream.updated": true,
} as const satisfies Record<DirectorEvent["kind"], boolean>;
const directorIntentPendingKinds = {
  cancel_run: "command",
  create_workstream: "command",
  move_selection: "none",
  resolve_approval: "command",
  resolve_resource_request: "command",
  select_workstream: "none",
  submit: "answering",
} as const satisfies Record<DirectorIntent["kind"], DirectorPendingKind>;
const idleDirectorPendingWork: DirectorPendingWork = { answering: false, dispatching: false };

export class DirectorRefreshCoordinator {
  private inFlight = false;
  private resyncPending = false;

  async request(
    state: DirectorLoadState,
    operation: (state: DirectorLoadState) => Promise<void>,
  ): Promise<void> {
    if (this.inFlight) {
      this.resyncPending ||= state === "resyncing";
      return;
    }
    this.inFlight = true;
    try {
      await operation(state);
    } finally {
      this.inFlight = false;
      if (this.resyncPending) {
        this.resyncPending = false;
        await this.request("resyncing", operation);
      }
    }
  }
}

export function DirectorCommandCenterShell({
  connectedRuntimeId,
  onOpenVoiceCredentialSettings,
  onOpenSettingsPage,
  platform,
  setta,
  speechPlayback,
}: DirectorCommandCenterShellProps): React.JSX.Element {
  const director = useDirectorRuntime(setta, speechPlayback, connectedRuntimeId);
  const workspaceBinding = useDirectorWorkspaceBinding(setta);
  const snapshotView = useMemo(
    () => directorCommandCenterSnapshotView(director.snapshot),
    [director.snapshot],
  );
  const artifactBrowser = useDirectorArtifactBrowser({
    artifacts: snapshotView.artifacts,
    readArtifact: setta.conversations.readArtifact,
    runtimeId: connectedRuntimeId,
  });
  const [canvas, setCanvas] = useState<DirectorGraphCanvas | null>(null);
  const [artifactParticleStyle, setArtifactParticleStyle] =
    useState<GraphArtifactParticleStyle>("fluid");
  const previousGraphLayoutSignatureRef = useRef<string | undefined>(undefined);
  const previousGraphCompositionRef = useRef<PreviousDirectorGraphComposition | null>(null);
  // Selection is a view: no workstream means the Director's own.
  // Read once. Which workstream is selected decides the view, the composition
  // and what a click on the canvas does, and re-deriving it at each of those
  // invited them to disagree.
  const snapshot = director.snapshot;
  const selectedWorkstreamId = selectedDirectorWorkstreamId(snapshot);
  const [graphDevThreadCount, setGraphDevThreadCount] =
    useState<DirectorGraphDevThreadCount | null>(null);
  const [graphDevNodeCount, setGraphDevNodeCount] = useState<DirectorGraphDevNodeCount>(
    directorGraphDevDefaultNodeCount,
  );
  const [graphDevSpeed, setGraphDevSpeed] = useState<DirectorGraphDevSpeed>(
    directorGraphDevDefaultSpeed,
  );
  const [graphDevDirectorEdgeDisturbance, setGraphDevDirectorEdgeDisturbance] = useState(false);
  const [graphDevPanelOpen, setGraphDevPanelOpen] = useState(false);
  const graphDevTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [graphDevTimeline, setGraphDevTimeline] = useState<DirectorGraphDevTimeline>(() =>
    createDirectorGraphDevTimeline(directorGraphDevDefaultSpeed),
  );
  const graphDevClockRef = useRef<DirectorGraphDevClock>({
    animationAnchorSeconds: 0,
    speed: directorGraphDevDefaultSpeed,
    timeline: graphDevTimeline,
    virtualAnchorSeconds: 0,
    wallAnchorMs: globalThis.performance.now(),
  });
  const [graphDevFrameIndex, setGraphDevFrameIndex] = useState(0);
  /*
   * A simulator count replaces the whole graph composition. It is useful
   * development work, but it must not monopolise the urgent input lane: React
   * can prepare the new shell between frames while the pressed control paints
   * immediately.
   */
  const selectGraphDevThreadCount = useCallback(
    (threadCount: DirectorGraphDevThreadCount | null): void => {
      const scheduledSpeed =
        graphDevSpeed === 0
          ? directorGraphDevScheduledSpeed(graphDevClockRef.current.timeline)
          : graphDevSpeed;
      const clock = resetDirectorGraphDevClock(
        graphDevSpeed,
        globalThis.performance.now(),
        scheduledSpeed,
      );
      graphDevClockRef.current = clock;
      setGraphDevTimeline(clock.timeline);
      setGraphDevFrameIndex(0);
      startTransition(() => {
        setGraphDevThreadCount(threadCount);
      });
    },
    [graphDevSpeed],
  );
  const selectGraphDevNodeCount = useCallback(
    (nodeCount: DirectorGraphDevNodeCount): void => {
      const scheduledSpeed =
        graphDevSpeed === 0
          ? directorGraphDevScheduledSpeed(graphDevClockRef.current.timeline)
          : graphDevSpeed;
      const clock = resetDirectorGraphDevClock(
        graphDevSpeed,
        globalThis.performance.now(),
        scheduledSpeed,
      );
      graphDevClockRef.current = clock;
      setGraphDevTimeline(clock.timeline);
      setGraphDevFrameIndex(0);
      startTransition(() => {
        setGraphDevNodeCount(nodeCount);
      });
    },
    [graphDevSpeed],
  );
  const selectGraphDevSpeed = useCallback(
    (speed: DirectorGraphDevSpeed): void => {
      const now = globalThis.performance.now();
      const current = graphDevClockRef.current;
      const virtualAnchorSeconds = directorGraphDevEventSecondsAt(current, now, graphDevNodeCount);
      const animationAnchorSeconds = directorGraphDevAnimationSecondsAt(current, now);
      const timeline =
        speed === 0
          ? current.timeline
          : rescheduleDirectorGraphDevTimeline(
              current.timeline,
              virtualAnchorSeconds,
              animationAnchorSeconds,
              speed,
            );
      graphDevClockRef.current = {
        animationAnchorSeconds,
        speed,
        timeline,
        virtualAnchorSeconds,
        wallAnchorMs: now,
      };
      if (timeline !== current.timeline) {
        setGraphDevTimeline(timeline);
      }
      setGraphDevSpeed(speed);
      setGraphDevFrameIndex(directorGraphDevFrameIndexAt(virtualAnchorSeconds, graphDevNodeCount));
      canvas?.invalidate();
    },
    [canvas, graphDevNodeCount],
  );
  const [graphViewport, setGraphViewport] = useState<GraphViewport>(initialDirectorGraphViewport);
  const onGraphViewportChange = useCallback((next: GraphViewport): void => {
    setGraphViewport((current) =>
      current.width === next.width && current.height === next.height ? current : next,
    );
  }, []);
  const snapshotGraphs = directorSnapshotGraphs(snapshot);
  const liveGraphTimeSecondsAt = useMemo(
    () => directorGraphTimeSecondsAt(director.snapshot),
    [snapshot === null ? null : snapshot.connection.lastEventAt, snapshotGraphs],
  );
  const graphDevTimeSecondsAt = useCallback(
    (timestampMs: number): number =>
      directorGraphDevAnimationSecondsAt(graphDevClockRef.current, timestampMs),
    [],
  );
  const graphDevScenario = useMemo(
    () =>
      directorGraphDevToolsEnabled && graphDevThreadCount !== null
        ? createDirectorGraphDevScenario(graphDevThreadCount, graphDevNodeCount, graphDevTimeline)
        : null,
    [graphDevNodeCount, graphDevThreadCount, graphDevTimeline],
  );
  const graphDevSimulation = useMemo(
    () =>
      graphDevScenario === null
        ? null
        : createDirectorGraphDevSimulation(
            graphDevScenario,
            graphViewport,
            graphDevFrameIndex * directorGraphDevFrameStepSeconds,
            graphDevTimeSecondsAt,
          ),
    [graphDevFrameIndex, graphDevScenario, graphDevTimeSecondsAt, graphViewport],
  );
  useEffect(() => {
    if (graphDevThreadCount === null || graphDevSpeed === 0) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNextFrame = (): void => {
      if (cancelled) {
        return;
      }
      const now = globalThis.performance.now();
      const timeSeconds = directorGraphDevEventSecondsAt(
        graphDevClockRef.current,
        now,
        graphDevNodeCount,
      );
      const frameIndex = directorGraphDevFrameIndexAt(timeSeconds, graphDevNodeCount);
      const maximumFrame = (graphDevNodeCount - 1) * directorGraphDevThreadPhaseCount;
      const nextTimeSeconds =
        frameIndex >= maximumFrame
          ? directorGraphDevCycleDurationSeconds(graphDevNodeCount)
          : (frameIndex + 1) * directorGraphDevFrameStepSeconds;
      const delayMs = Math.max(16, ((nextTimeSeconds - timeSeconds) / graphDevSpeed) * 1000 + 1);
      timer = globalThis.setTimeout(() => {
        const callbackNow = globalThis.performance.now();
        const nextFrameIndex = directorGraphDevFrameIndexAt(
          directorGraphDevEventSecondsAt(graphDevClockRef.current, callbackNow, graphDevNodeCount),
          graphDevNodeCount,
        );
        if (frameIndex >= maximumFrame || nextFrameIndex < frameIndex) {
          const current = graphDevClockRef.current;
          if (current.speed === 0) {
            return;
          }
          const reset = resetDirectorGraphDevClock(current.speed, callbackNow, current.speed);
          graphDevClockRef.current = reset;
          setGraphDevTimeline(reset.timeline);
          setGraphDevFrameIndex(0);
          scheduleNextFrame();
          return;
        }
        setGraphDevFrameIndex((current) => (current === nextFrameIndex ? current : nextFrameIndex));
        scheduleNextFrame();
      }, delayMs);
    };
    scheduleNextFrame();
    return () => {
      cancelled = true;
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
    };
  }, [graphDevNodeCount, graphDevSpeed, graphDevThreadCount]);
  const composition = useMemo(() => {
    if (graphDevSimulation !== null) {
      return {
        presentation: graphDevSimulation.presentation,
        snapshot: graphDevSimulation.snapshot,
      };
    }
    return packDirectorGraphs(snapshotGraphs, selectedWorkstreamId, graphViewport);
  }, [graphDevSimulation, graphViewport, snapshotGraphs, selectedWorkstreamId]);
  /*
   * A dense grid owns the full canvas until the user asks for supporting
   * context. Its rails use the same mutually exclusive floating disclosure as
   * a narrow window, so Now and Artifacts remain reachable even at 100 threads
   * without permanently covering the graph.
   */
  const {
    closeCompactRail,
    compactRail,
    effectiveVisibility: visibleRailVisibility,
    floating: railsFloat,
    toggleRail,
  } = useDirectorRailDisclosure(composition.presentation === "grid");
  const graphTimeSecondsAt = directorGraphTimeSource(graphDevSimulation, liveGraphTimeSecondsAt);
  const packedSnapshot = composition.snapshot;
  const graphColumnTitles = useMemo(
    () => graphDevSimulation?.titles ?? directorColumnTitles(snapshot),
    [graphDevSimulation?.threadCount, snapshot?.workstreams],
  );
  const { openWorkstream: openWorkstreamFromGraph } = useDirectorGraphPresentation({
    dispatch: director.dispatch,
  });
  const railAttributes = directorRailVisibilityAttributes(visibleRailVisibility);
  const focus = directorFocus(snapshotView.selectedWorkstream);
  const graphLoading = directorGraphIsLoading(director.loadState);
  const switchTransition = useDirectorWorkstreamSwitchTransition(director.snapshot);
  const contentInert = artifactBrowser.activeArtifact !== null;
  const onGraphReady = useCallback((host: DirectorGraphCanvas | null) => {
    setCanvas(host);
  }, []);
  /*
   * What you are looking at is what you are talking to.
   *
   * On the Director's view this is the intent it has always dispatched. On a
   * workstream's view the words go to that conversation, and the router decides
   * whether they steer the run, queue behind it, or answer from what it already
   * knows — then say which, because a silent wrong guess is worse than not
   * guessing at all.
   */
  const submitTranscriptToCurrentView = useCallback(
    async (text: string): Promise<string | null> => {
      const receipt = await director.dispatch(directorSubmitIntent(text));
      return receipt.submit?.replyText ?? null;
    },
    [director.dispatch],
  );
  const submitToCurrentView = useCallback(
    async (text: string): Promise<void> => {
      await submitTranscriptToCurrentView(text);
    },
    [submitTranscriptToCurrentView],
  );
  /*
   * Voice submits through the same door as text, so speaking to a workstream's
   * view routes exactly as typing at it does. It returns the receipt line the
   * capture surface shows, which for a workstream is what the router decided.
   */
  const speechCapture = useDirectorSpeechCapture({
    runtimeId: connectedRuntimeId,
    setta,
    speechPlayback,
    submitTranscript: submitTranscriptToCurrentView,
  });
  useEffect(() => {
    if (canvas === null) {
      return;
    }
    // Presentation first: it decides how the snapshot is read, so the canvas
    // must never see a new composition under the old rules. The Director's
    // own lane is the view's self on its view, so its turns fold on click
    // instead of "opening" the view the user is already on.
    const applied = applyDirectorGraphCanvasComposition({
      canvas,
      composition,
      devNodeCount: graphDevNodeCount,
      devThreadCount: graphDevThreadCount,
      graphViewport,
      previous: previousGraphCompositionRef.current,
      previousLayoutSignature: previousGraphLayoutSignatureRef.current,
      selectedWorkstreamId,
      simulation: graphDevSimulation,
      snapshotGraphs,
    });
    previousGraphLayoutSignatureRef.current = applied.layoutSignature;
    previousGraphCompositionRef.current = applied.next;
  }, [
    canvas,
    composition,
    graphDevNodeCount,
    graphDevSimulation,
    graphDevThreadCount,
    graphViewport,
    selectedWorkstreamId,
    snapshotGraphs,
  ]);

  useEffect(() => {
    canvas?.setColumnTitles(graphColumnTitles);
  }, [canvas, graphColumnTitles]);

  useEffect(() => {
    canvas?.setDirectorEdgeDisturbance(graphDevDirectorEdgeDisturbance);
  }, [canvas, graphDevDirectorEdgeDisturbance]);

  useEffect(() => {
    canvas?.setArtifactParticleStyle(
      artifactBrowser.activeArtifact === null ? null : artifactParticleStyle,
      artifactBrowser.activeArtifact?.id,
    );
  }, [artifactBrowser.activeArtifact, artifactParticleStyle, canvas]);

  // The input node breathes only while the microphone is actually capturing.
  useEffect(() => {
    canvas?.setListening(speechCapture.snapshot.capture.type === "recording");
  }, [canvas, speechCapture.snapshot.capture.type]);

  const [labelsVisible, setLabelsVisible] = useState(() =>
    readGraphLabelsVisible(globalThis.localStorage),
  );
  const toggleLabels = useCallback(() => {
    setLabelsVisible((current) => {
      const next = !current;
      writeGraphLabelsVisible(globalThis.localStorage, next);
      return next;
    });
  }, []);
  useEffect(() => {
    canvas?.setLabelsEnabled(labelsVisible);
  }, [canvas, labelsVisible]);

  // Each switch plays once: the transition key names the switch, and the slide
  // must not replay when the same transition object merely settles inactive.
  const playedSwitchKeyRef = useRef(0);
  useEffect(() => {
    if (
      canvas === null ||
      !switchTransition.active ||
      switchTransition.direction === null ||
      playedSwitchKeyRef.current === switchTransition.key
    ) {
      return;
    }
    playedSwitchKeyRef.current = switchTransition.key;
    canvas.playWorkstreamSwitch(
      switchTransition.direction === "next"
        ? 1
        : switchTransition.direction === "previous"
          ? -1
          : 0,
    );
  }, [canvas, switchTransition]);

  useDirectorShellKeyboardNavigation({
    artifactBrowserOpen: artifactBrowser.activeArtifact !== null,
    closeCompactRail,
    compactRail,
    dispatch: director.dispatch,
  });

  return (
    <main
      className="director-command-center"
      data-artifact-view={directorArtifactViewAttribute(artifactBrowser.activeArtifact !== null)}
      data-artifacts-rail={railAttributes.artifacts}
      data-desktop-platform={platform}
      data-graph-simulation-nodes={graphDevSimulation?.nodeCount}
      data-graph-simulation-rendered-nodes={graphDevSimulation?.snapshot.nodeCount}
      data-graph-simulation-source-nodes={graphDevSimulation?.sourceNodeCount}
      data-graph-simulation={graphDevSimulation?.threadCount}
      data-graph-simulation-frame={graphDevSimulation?.frameKey}
      data-graph-simulation-speed={directorGraphSimulationSpeedAttribute(
        graphDevSimulation,
        graphDevSpeed,
      )}
      data-now-rail={railAttributes.now}
      data-rail-layout={directorRailLayoutAttribute(railsFloat)}
      data-testid="director-command-center-shell"
      data-workstream-switch-direction={directorSwitchDirectionAttribute(
        switchTransition.direction,
      )}
      data-workstream-switching={directorBooleanDataAttribute(switchTransition.active)}
    >
      <div
        aria-hidden={directorOptionalBoolean(contentInert)}
        className="director-command-center-content"
        inert={directorOptionalBoolean(contentInert)}
      >
        <a className="director-command-center-skip" href={`#${directorComposerInputId}`}>
          Skip to composer
        </a>
        <CommandCenterTopBar
          dispatch={director.dispatch}
          graphDevTools={directorGraphDevTopBarTools({
            active: graphDevThreadCount !== null,
            onToggle: () => setGraphDevPanelOpen((current) => !current),
            open: graphDevPanelOpen,
            triggerRef: graphDevTriggerRef,
          })}
          labelsVisible={labelsVisible}
          onToggleLabels={toggleLabels}
          onToggleRail={toggleRail}
          onOpenSettingsPage={onOpenSettingsPage}
          platform={platform}
          railVisibility={visibleRailVisibility}
          snapshot={director.snapshot}
          speechPlayback={speechPlayback}
        />
        <section className="director-command-center-stage" aria-label="Director command center">
          <DirectorGraphSurface
            ambientMotion
            label="Director semantic graph"
            loading={graphLoading}
            onOpenWorkstream={directorGraphOpenWorkstreamHandler(
              graphDevSimulation,
              openWorkstreamFromGraph,
            )}
            onReady={onGraphReady}
            onViewportChange={onGraphViewportChange}
            timeSecondsAt={graphTimeSecondsAt}
          />
          <DirectorLoadStatus state={director.loadState} />
          <DirectorGraphEmptyStateSlot
            focus={focus}
            loadState={director.loadState}
            nodeCount={packedSnapshot.nodeCount}
          />
          <NowRail
            narration={snapshotView.narration}
            visible={visibleRailVisibility.now}
            workstreamStatus={directorWorkstreamStatus(snapshotView.selectedWorkstream)}
          />
          <ArtifactsRail
            approvals={snapshotView.approvals}
            artifactBrowser={artifactBrowser}
            artifacts={snapshotView.artifacts}
            requests={snapshotView.requests}
            visible={visibleRailVisibility.artifacts}
          />
          {/*
           * Waiting-on-you and the composer share a dock so they stack in one
           * column above the canvas. They are siblings, not nested: an approval
           * renders its own form, and a form inside the composer's form is
           * dropped by the parser, which silently kills the approval's submit.
           */}
          <div className="director-composer-dock">
            {/*
             * What the Director just said, above the composer that asked.
             *
             * It used to live in the Now rail, which the Director's own view
             * hides — so the app's primary interaction completed with no
             * readable answer. A reply belongs beside the thing you typed into,
             * not in a rail about a workstream.
             */}
            <DirectorReply
              answering={director.pending.answering}
              loadState={director.loadState}
              message={director.message}
              receiptText={director.receiptText}
            />
            <PendingActions
              approvals={snapshotView.approvals}
              dispatch={director.dispatch}
              dispatching={director.pending.dispatching}
              openLocalFolder={workspaceBinding.openLocalFolder}
              requests={snapshotView.requests}
              workspaceSession={workspaceBinding.session}
            />
            <DirectorComposer
              answering={director.pending.answering}
              focus={focus}
              onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
              onSubmit={submitToCurrentView}
              speechCapture={speechCapture}
            />
            <CompactWorkstreamNavigation
              dispatch={director.dispatch}
              snapshot={director.snapshot}
            />
          </div>
        </section>
        <DirectorGraphDevPanelSlot
          enabled={directorGraphDevToolsEnabled}
          panel={{
            description: directorGraphDevDescription(graphDevSimulation),
            directorEdgeDisturbance: graphDevDirectorEdgeDisturbance,
            nodeCount: graphDevNodeCount,
            onOpenChange: setGraphDevPanelOpen,
            onSelectNodeCount: selectGraphDevNodeCount,
            onSelectSpeed: selectGraphDevSpeed,
            onSelectThreadCount: selectGraphDevThreadCount,
            onToggleDirectorEdgeDisturbance: setGraphDevDirectorEdgeDisturbance,
            open: graphDevPanelOpen,
            speed: graphDevSpeed,
            threadCount: graphDevThreadCount,
            triggerRef: graphDevTriggerRef,
          }}
        />
      </div>
      <ArtifactBrowserSurfaceSlot
        browser={artifactBrowser}
        onParticleStyleChange={setArtifactParticleStyle}
        particleStyle={artifactParticleStyle}
        showParticleStyleControls={directorGraphDevToolsEnabled}
      />
    </main>
  );
}

/**
 * What the canvas says when there is nothing to draw.
 *
 * A workstream with no committed nodes renders only the drifting medium, which
 * is indistinguishable from a graph that failed to draw. The mockup never has
 * this state — it is a demo with scripted activity — so the empty case had no
 * answer at all: an idle workstream showed an empty void and said nothing.
 *
 * It is DOM over the canvas, like every other graph label, and it names the one
 * action that changes the state rather than describing the emptiness.
 */
function GraphEmptyState({ focus }: { focus: DirectorFocus }) {
  return (
    <div className="director-graph-empty" role="status">
      <p className="director-graph-empty-line">
        {focus.kind === "director"
          ? "No work has started yet."
          : "Nothing has run in this workstream yet."}
      </p>
      <p className="director-graph-empty-hint">Ask the Director below to start.</p>
    </div>
  );
}

/** Canvas motion has an equivalent polite announcement without visible chrome. */
function DirectorLoadStatus({ state }: { state: DirectorLoadState }) {
  const text = directorLoadStatusText(state);
  return (
    <span aria-atomic="true" aria-live="polite" className="sr-only" role="status">
      {text}
    </span>
  );
}

function directorLoadStatusText(state: DirectorLoadState): string {
  switch (state) {
    case "loading":
      return "Director is loading.";
    case "resyncing":
      return "Director is updating.";
    case "ready":
      return "Director ready.";
    case "error":
      // The visible reply is already a live status and carries the useful error.
      return "";
    default:
      return exhaustiveDirectorLoadState(state);
  }
}

function exhaustiveDirectorLoadState(state: never): never {
  throw new Error(`unsupported Director load state ${state}`);
}

function useDirectorRuntime(
  setta: SettaAPI,
  speechPlayback: AppShellSpeechPlaybackController,
  runtimeId: string | null,
): DirectorRuntimeState & {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
} {
  const [snapshot, setSnapshotState] = useState<DirectorSnapshot | null>(null);
  const [loadState, setLoadState] = useState<DirectorLoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState<string | null>(null);
  const [pending, setPending] = useState<DirectorPendingWork>(idleDirectorPendingWork);
  const snapshotRef = useRef<DirectorSnapshot | null>(null);
  const setSnapshot = useCallback((next: DirectorSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);
  const runtimeEpoch = useMemo(() => Symbol(runtimeId ?? "disconnected"), [runtimeId]);
  const runtimeEpochRef = useRef(runtimeEpoch);
  const pendingDispatchesRef = useRef(new Map<symbol, DirectorPendingKind>());
  const submitQueueRef = useRef<DirectorSubmitQueue>({
    epoch: runtimeEpoch,
    tail: Promise.resolve(),
  });

  useLayoutEffect(() => {
    runtimeEpochRef.current = runtimeEpoch;
    pendingDispatchesRef.current.clear();
    submitQueueRef.current = { epoch: runtimeEpoch, tail: Promise.resolve() };
    setPending(idleDirectorPendingWork);
    setReceiptText(null);
    setSnapshot(null);
    setLoadState("loading");
    setMessage(null);
  }, [runtimeEpoch, setSnapshot]);

  useEffect(() => {
    let disposed = false;
    let disposeEvents: (() => void) | null = null;
    let pendingVisibleFrame: number | null = null;
    const refreshCoordinator = new DirectorRefreshCoordinator();

    const cancelPendingVisibleFrame = (): void => {
      if (pendingVisibleFrame === null) {
        return;
      }
      window.cancelAnimationFrame(pendingVisibleFrame);
      pendingVisibleFrame = null;
    };

    const publishVisibleSnapshot = (): void => {
      pendingVisibleFrame = null;
      if (!disposed) {
        setSnapshotState(snapshotRef.current);
      }
    };

    const refresh = (state: DirectorLoadState): Promise<void> =>
      refreshCoordinator.request(state, async (requestedState) => {
        if (disposed || runtimeId === null) {
          return;
        }
        cancelPendingVisibleFrame();
        setLoadState(requestedState);
        setMessage(null);
        disposeEvents?.();
        disposeEvents = null;
        try {
          const next = await setta.director.readSnapshot();
          if (disposed) {
            return;
          }
          setSnapshot(next);
          setLoadState("ready");
          setMessage(null);
          disposeEvents = setta.director.onEvent((event) => {
            handleDirectorEvent(event);
          });
          await setta.director.subscribe({ cursor: next.eventCursor });
        } catch {
          if (!disposed) {
            setLoadState("error");
            setMessage("The Director command center is unavailable.");
          }
        }
      });

    const handleDirectorEvent = (event: DirectorEvent): void => {
      const current = snapshotRef.current;
      if (
        event.kind === "director.resync_required" ||
        current === null ||
        event.streamId !== current.eventCursor.streamId ||
        event.sequence !== current.eventCursor.sequence + 1
      ) {
        void refresh("resyncing");
        return;
      }
      try {
        const next = applyDirectorEvent(current, event);
        snapshotRef.current = next;
        if (directorEventChangesVisibleState(event) && pendingVisibleFrame === null) {
          pendingVisibleFrame = window.requestAnimationFrame(publishVisibleSnapshot);
        }
      } catch {
        void refresh("resyncing");
      }
    };

    if (runtimeId !== null) {
      void refresh("loading");
    }
    return () => {
      disposed = true;
      cancelPendingVisibleFrame();
      disposeEvents?.();
    };
  }, [runtimeEpoch, runtimeId, setSnapshot, setta]);

  const handleDirectorReceipt = useCallback(
    (intent: DirectorIntent, receipt: DirectorReceipt, dispatchEpoch: symbol) => {
      if (runtimeEpochRef.current !== dispatchEpoch || intent.kind !== "submit") {
        return;
      }
      setReceiptText(receipt.submit?.replyText || null);
      void enqueueDirectorSpeechPlayback({
        controller: speechPlayback,
        readDirectorVoiceSelection: setta.speech.readDirectorVoiceSelection,
        receipt,
      }).catch((error: unknown) => {
        console.info(`Director speech playback unavailable: ${directorErrorMessage(error)}`);
      });
    },
    [setta, speechPlayback],
  );

  const finishPendingDispatch = useCallback(
    (pendingToken: symbol | null, dispatchEpoch: symbol) => {
      if (pendingToken === null) {
        return;
      }
      pendingDispatchesRef.current.delete(pendingToken);
      if (runtimeEpochRef.current === dispatchEpoch) {
        setPending(directorPendingWork(pendingDispatchesRef.current.values()));
      }
    },
    [],
  );

  const dispatch = useCallback(
    async (intent: DirectorIntent): Promise<DirectorReceipt> => {
      const pendingKind = directorIntentPendingKinds[intent.kind];
      const pendingToken = pendingKind === "none" ? null : Symbol(intent.kind);
      const dispatchEpoch = runtimeEpoch;
      if (intent.kind === "submit") {
        speechPlayback.preemptForUserInput();
      }
      if (pendingToken !== null) {
        pendingDispatchesRef.current.set(pendingToken, pendingKind);
        setPending(directorPendingWork(pendingDispatchesRef.current.values()));
      }
      setMessage(null);
      try {
        const dispatchIntent = (): Promise<DirectorReceipt> => {
          if (runtimeEpochRef.current !== dispatchEpoch) {
            return Promise.reject(new Error("Director runtime changed before dispatch"));
          }
          return setta.director.dispatch(intent);
        };
        const receipt =
          intent.kind === "submit"
            ? await enqueueDirectorSubmit(submitQueueRef.current, dispatchEpoch, dispatchIntent)
            : await dispatchIntent();
        handleDirectorReceipt(intent, receipt, dispatchEpoch);
        return receipt;
      } catch (error) {
        if (runtimeEpochRef.current === dispatchEpoch) {
          setMessage(directorDispatchFailureMessage(intent));
        }
        throw error;
      } finally {
        finishPendingDispatch(pendingToken, dispatchEpoch);
      }
    },
    [finishPendingDispatch, handleDirectorReceipt, runtimeEpoch, setta, speechPlayback],
  );

  return { dispatch, loadState, message, pending, receiptText, snapshot };
}

function useDirectorWorkspaceBinding(setta: SettaAPI): {
  openLocalFolder: () => Promise<WorkspaceSummary | null>;
  session: WorkspaceSession | null;
} {
  const session = useWorkspaceStore((state) => state.session);
  const applyWorkspaceSession = useWorkspaceStore((state) => state.applySession);
  const openLocalFolder = useCallback(async (): Promise<WorkspaceSummary | null> => {
    const response = await setta.workspace.openLocalFolder();
    if (response === null) {
      return null;
    }
    applyWorkspaceSession(response.session);
    return response.workspace;
  }, [applyWorkspaceSession, setta]);
  return { openLocalFolder, session };
}

function directorCommandCenterSnapshotView(
  snapshot: DirectorSnapshot | null,
): DirectorCommandCenterSnapshotView {
  if (snapshot === null) {
    return emptyCommandCenterSnapshotView();
  }
  const selected = selectedWorkstreamEntry(snapshot)?.workstream ?? null;
  return {
    approvals: snapshot.unresolvedApprovals,
    /*
     * A workstream's view lists its own artifacts. The Director's view is the
     * whole desk, so it lists every thread's artifacts in the order they were
     * produced — one chronology across the work, not a per-thread scope.
     */
    artifacts:
      selected === null
        ? [...snapshot.artifacts].sort(byCreatedAt)
        : snapshot.artifacts.filter((artifact) => artifact.workstreamId === selected.id),
    /*
     * Same rule for the narrator: the Director's Now rail interleaves what
     * every thread reported, in the order it was said.
     */
    narration:
      selected === null
        ? snapshot.workstreams.flatMap((entry) => entry.workstream.narration).sort(byCreatedAt)
        : selected.narration,
    requests: snapshot.unresolvedResourceRequests,
    selectedWorkstream: selected,
  };
}

function byCreatedAt(left: { createdAt: string }, right: { createdAt: string }): number {
  return left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;
}

function emptyCommandCenterSnapshotView(): DirectorCommandCenterSnapshotView {
  return {
    narration: [],
    approvals: [],
    artifacts: [],
    requests: [],
    selectedWorkstream: null,
  };
}

/** Thread names for the canvas's column titles, the Director's lane included. */
function directorColumnTitles(snapshot: DirectorSnapshot | null): ReadonlyMap<string, string> {
  const titles = new Map<string, string>([[directorGraphLaneId, "Director"]]);
  for (const entry of snapshot?.workstreams ?? []) {
    titles.set(entry.workstream.id, entry.workstream.title);
  }
  return titles;
}

function directorRailVisibilityAttributes(visibility: DirectorRailVisibility) {
  return {
    artifacts: visibility.artifacts ? "shown" : "hidden",
    now: visibility.now ? "shown" : "hidden",
  };
}

function useDirectorRailDisclosure(floatForPresentation: boolean) {
  const [railVisibility, setRailVisibility] =
    useState<DirectorRailVisibility>(defaultRailVisibility);
  const [compactRail, setCompactRail] = useState<DirectorCompactRail>(null);
  const compactRailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasCompactRailOpenRef = useRef(false);
  const compact = useCompactRailLayout();
  const floating = compact || floatForPresentation;
  const effectiveVisibility = effectiveDirectorRailVisibility({
    compact: floating,
    compactRail,
    railVisibility,
  });
  const closeCompactRail = useCallback(() => {
    setCompactRail(null);
  }, []);
  useLayoutEffect(() => {
    if (wasCompactRailOpenRef.current && compactRail === null) {
      const trigger = compactRailTriggerRef.current;
      if (trigger !== null && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
      compactRailTriggerRef.current = null;
    }
    wasCompactRailOpenRef.current = compactRail !== null;
  }, [compactRail]);
  useEffect(() => {
    if (!floating) {
      closeCompactRail();
    }
  }, [closeCompactRail, floating]);
  const toggleRail = useCallback(
    (rail: Exclude<DirectorCompactRail, null>, trigger: HTMLButtonElement) => {
      if (floating) {
        if (compactRail !== rail) {
          compactRailTriggerRef.current = trigger;
        }
        setCompactRail((current) => (current === rail ? null : rail));
        return;
      }
      setRailVisibility((current) => ({ ...current, [rail]: !current[rail] }));
    },
    [compactRail, floating],
  );
  return { closeCompactRail, compactRail, effectiveVisibility, floating, toggleRail };
}

function useDirectorShellKeyboardNavigation({
  artifactBrowserOpen,
  closeCompactRail,
  compactRail,
  dispatch,
}: {
  artifactBrowserOpen: boolean;
  closeCompactRail: () => void;

  compactRail: DirectorCompactRail;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      // The artifact browser is the active application surface: it owns Escape,
      // arrow keys, and every keystroke inside it, so shell shortcuts stand down
      // rather than steering the inert graph or composer behind it.
      if (artifactBrowserOpen) {
        return;
      }
      if (event.key === "Escape") {
        closeDirectorShellLayers({ closeCompactRail, compactRail, event });
        return;
      }
      const targetIsEditable = directorKeyboardTargetIsEditable(event.target);
      if (
        directorComposerTakesKeystroke({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          targetIsEditable,
        })
      ) {
        // No preventDefault: the keystroke's own default action types the
        // character into whatever now holds focus, which is the composer.
        focusDirectorComposer(globalThis.document);
        return;
      }
      const direction = directorWorkstreamKeyboardDirection({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        targetIsEditable,
      });
      if (direction === null) {
        return;
      }
      event.preventDefault();
      dispatchDirectorIntent(dispatch, moveSelectionIntent(direction));
    };
    globalThis.window?.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.window?.removeEventListener("keydown", handleKeyDown);
    };
  }, [artifactBrowserOpen, closeCompactRail, compactRail, dispatch]);
}

/**
 * Escape's whole meaning in the shell: dismiss the compact rail.
 *
 * It used to close the history overlay too, and both together so the reader
 * never pressed Escape twice. The overlay is gone — it showed the reader their
 * own prompt back — so the compact rail is the only dismissable layer the shell
 * owns. With it closed, Escape belongs to whatever holds focus and the shell
 * leaves the default alone.
 */
function closeDirectorShellLayers({
  closeCompactRail,
  compactRail,
  event,
}: {
  closeCompactRail: () => void;
  compactRail: DirectorCompactRail;
  event: KeyboardEvent;
}): void {
  if (compactRail === null) {
    return;
  }
  event.preventDefault();
  closeCompactRail();
}

function useDirectorSpeechCapture({
  runtimeId,
  setta,
  speechPlayback,
  submitTranscript,
}: {
  runtimeId: string | null;
  setta: SettaAPI;
  speechPlayback: AppShellSpeechPlaybackController;
  submitTranscript: (text: string) => Promise<string | null>;
}): DirectorSpeechCaptureBinding {
  const submitRef = useRef(submitTranscript);
  submitRef.current = submitTranscript;
  const [controller] = useState(
    () =>
      new DirectorSpeechCaptureController({
        captureProvider: createBrowserVoiceInputProvider(setta),
        clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
        createCaptureSessionId: () => globalThis.crypto.randomUUID(),
        submitTranscript: (text) => submitRef.current(text),
        onCaptureEnd: speechPlayback.resumeAfterCapture,
        onCaptureStart: speechPlayback.preemptForCapture,
        setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
      }),
  );
  const [effectLifetime] = useState(() => new AppShellSpeechCaptureEffectLifetime());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useLayoutEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useLayoutEffect(() => registerRendererPageTeardown(() => controller.dispose()), [controller]);
  useEffect(() => {
    void controller.synchronizeRuntime(runtimeId);
  }, [controller, runtimeId]);
  useEffect(() => subscribeSpeechCapabilityRefresh(setta, controller), [controller, setta]);

  return { controller, snapshot };
}

export function directorEventChangesVisibleState(event: DirectorEvent): boolean {
  return directorEventVisibility[event.kind];
}

export function directorPendingWork(pending: Iterable<DirectorPendingKind>): DirectorPendingWork {
  let answering = false;
  let dispatching = false;
  for (const kind of pending) {
    answering ||= kind === "answering";
    dispatching ||= kind === "command";
  }
  return { answering, dispatching };
}

function enqueueDirectorSubmit(
  queue: DirectorSubmitQueue,
  dispatchEpoch: symbol,
  operation: () => Promise<DirectorReceipt>,
): Promise<DirectorReceipt> {
  if (queue.epoch !== dispatchEpoch) {
    return Promise.reject(new Error("Director submit queue belongs to another runtime"));
  }
  const queued = queue.tail.then(operation);
  queue.tail = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function directorDispatchFailureMessage(intent: DirectorIntent): string {
  return intent.kind === "submit"
    ? "The Director could not finish that request. Try again."
    : "That action did not finish. Try again.";
}

function dispatchDirectorIntent(
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>,
  intent: DirectorIntent,
): void {
  void dispatch(intent).catch(() => {});
}

/*
 * Which rails the current view has.
 *
 * Every view has both, the Director's included: its rails carry the whole
 * desk's narration and artifacts interleaved chronologically, which is
 * exactly the summary a view of every workstream owes. The top-bar toggles
 * still hide either one.
 */
export function effectiveDirectorRailVisibility({
  compact,
  compactRail,
  railVisibility,
}: {
  compact: boolean;
  compactRail: DirectorCompactRail;
  railVisibility: DirectorRailVisibility;
}): DirectorRailVisibility {
  if (!compact) {
    return railVisibility;
  }
  return {
    artifacts: compactRail === "artifacts",
    now: compactRail === "now",
  };
}

function useCompactRailLayout(): boolean {
  return useMediaQueryMatch(compactRailQuery);
}

function useMediaQueryMatch(query: string): boolean {
  const [matches, setMatches] = useState(
    () => globalThis.window?.matchMedia?.(query).matches ?? false,
  );
  useEffect(() => {
    const list = globalThis.window?.matchMedia?.(query);
    if (!list) {
      return;
    }
    const update = (): void => {
      setMatches(list.matches);
    };
    update();
    list.addEventListener("change", update);
    return () => {
      list.removeEventListener("change", update);
    };
  }, [query]);
  return matches;
}

function directorKeyboardTargetIsEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(target.closest("input, textarea, select, [contenteditable='true']")))
  );
}

function directorErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "unknown Director speech playback failure";
}
