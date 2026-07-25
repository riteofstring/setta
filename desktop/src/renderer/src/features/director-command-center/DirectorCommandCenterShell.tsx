import type {
  DirectorEvent,
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  Workstream,
  WorkstreamStatus,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { History } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { subscribeSpeechCapabilityRefresh } from "../global-speech/app-shell-speech-capture";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import { createBrowserVoiceInputProvider } from "../global-speech/browser-voice-input-provider";
import { emptyPackedGraphSnapshot } from "../director-graph/packed-graph-snapshot";
import {
  packSemanticGraphComposition,
  semanticGraphTimeOriginSeconds,
} from "../director-graph/semantic-graph-packer";
import { DirectorGraphSurface } from "../director-graph/render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../director-graph/render/director-graph-canvas";
import { DirectorComposer, type DirectorSpeechCaptureBinding } from "./DirectorComposer";
import {
  compactDirectorHistory,
  DirectorHistoryOverlaySlot,
  type DirectorHistory,
} from "./DirectorHistoryOverlay";
import {
  currentDirectorActivity,
  DirectorNowActivityList,
  type DirectorNowActivity,
} from "./DirectorNowActivityList";
import {
  applyDirectorEvent,
  selectedWorkstreamEntry,
  visibleSelectedGraph,
} from "./director-command-center-state";
import { enqueueDirectorSpeechPlayback } from "./director-speech-playback";
import { DirectorSpeechCaptureController } from "./director-speech-capture";
import { ArtifactsRail } from "./DirectorArtifactsRail";
import {
  useDirectorWorkstreamSwitchTransition,
  WorkstreamSwitchTransition,
} from "./director-workstream-switch-transition";
import {
  directorComposerCommitment,
  directorWorkstreamStatusLabels,
} from "./director-workstream-status";
import {
  CommandCenterTopBar,
  directorWorkstreamKeyboardDirection,
  moveSelectionIntent,
  StatusGlyph,
  type DirectorRailVisibility,
} from "./DirectorWorkstreamNavigation";

interface DirectorCommandCenterShellProps {
  connectedRuntimeId: string | null;
  onOpenVoiceCredentialSettings: () => void;
  onOpenSettingsPage: () => void;
  platform: DesktopPlatform;
  setta: SettaAPI;
  speechPlayback: AppShellSpeechPlaybackController;
}

type DirectorLoadState = "loading" | "ready" | "resyncing" | "error";

interface DirectorRuntimeState {
  readonly dispatching: boolean;
  readonly loadState: DirectorLoadState;
  readonly message: string | null;
  readonly receiptText: string | null;
  readonly snapshot: DirectorSnapshot | null;
}

interface DirectorCommandCenterSnapshotView {
  readonly activity: DirectorNowActivity;
  readonly approvals: readonly DirectorSnapshot["unresolvedApprovals"][number][];
  readonly artifacts: readonly DirectorSnapshot["artifacts"][number][];
  readonly history: DirectorHistory;
  readonly requests: readonly DirectorSnapshot["unresolvedResourceRequests"][number][];
  readonly selectedWorkstream: Workstream | null;
}

type DirectorCompactRail = "artifacts" | "now" | null;

const defaultRailVisibility = {
  artifacts: true,
  now: true,
} as const satisfies DirectorRailVisibility;

const compactRailQuery = "(max-width: 760px)";
const directorGraphCompositionId = "director-command-center";
const currentWorkstreamSummaryRules = {
  archived: "milestone",
  awaiting_approval: "milestone",
  awaiting_resource: "resource_required",
  blocked: "milestone",
  completed: "milestone",
  failed: "milestone",
  idle: "cancelled",
  queued: null,
  running: null,
} as const satisfies Record<
  WorkstreamStatus,
  "cancelled" | "milestone" | "resource_required" | null
>;
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
const directorIntentBusyState = {
  cancel_run: true,
  move_selection: false,
  resolve_approval: true,
  resolve_resource_request: true,
  select_workstream: false,
  submit: true,
} as const satisfies Record<DirectorIntent["kind"], boolean>;

export function DirectorCommandCenterShell({
  connectedRuntimeId,
  onOpenVoiceCredentialSettings,
  onOpenSettingsPage,
  platform,
  setta,
  speechPlayback,
}: DirectorCommandCenterShellProps): React.JSX.Element {
  const director = useDirectorRuntime(setta, speechPlayback);
  const speechCapture = useDirectorSpeechCapture({
    dispatch: director.dispatch,
    runtimeId: connectedRuntimeId,
    setta,
    speechPlayback,
  });
  const workspaceBinding = useDirectorWorkspaceBinding(setta);
  const snapshotView = useMemo(
    () => directorCommandCenterSnapshotView(director.snapshot),
    [director.snapshot],
  );
  const [canvas, setCanvas] = useState<DirectorGraphCanvas | null>(null);
  const {
    close: closeHistory,
    isOpen: historyOpen,
    open: openHistory,
  } = useDirectorHistoryDialog();
  const {
    closeCompactRail,
    compactRail,
    effectiveVisibility: effectiveRailVisibility,
    toggleRail,
  } = useDirectorRailDisclosure();
  const snapshotGraphs = director.snapshot?.graphs;
  const graphTimeSecondsAt = useMemo(
    () => directorGraphTimeSecondsAt(director.snapshot),
    [director.snapshot?.connection.lastEventAt, snapshotGraphs],
  );
  const packedSnapshot = useMemo(() => packDirectorGraphs(snapshotGraphs), [snapshotGraphs]);
  const railAttributes = directorRailVisibilityAttributes(effectiveRailVisibility);
  const switchTransition = useDirectorWorkstreamSwitchTransition(director.snapshot);
  const onGraphReady = useCallback((host: DirectorGraphCanvas | null) => {
    setCanvas(host);
  }, []);

  useEffect(() => {
    canvas?.setSnapshot(packedSnapshot);
  }, [canvas, packedSnapshot]);

  useDirectorShellKeyboardNavigation({
    closeCompactRail,
    closeHistory,
    compactRail,
    dispatch: director.dispatch,
    historyOpen,
  });

  return (
    <main
      className="director-command-center"
      data-artifacts-rail={railAttributes.artifacts}
      data-desktop-platform={platform}
      data-now-rail={railAttributes.now}
      data-testid="director-command-center-shell"
      data-workstream-switch-direction={switchTransition.direction ?? undefined}
      data-workstream-switching={switchTransition.active ? "true" : "false"}
    >
      <a className="director-command-center-skip" href="#director-composer-input">
        Skip to composer
      </a>
      <CommandCenterTopBar
        dispatch={director.dispatch}
        onToggleRail={toggleRail}
        onOpenSettingsPage={onOpenSettingsPage}
        platform={platform}
        railVisibility={effectiveRailVisibility}
        snapshot={director.snapshot}
      />
      <section className="director-command-center-stage" aria-label="Director command center">
        <DirectorGraphSurface
          label="Director semantic graph"
          onReady={onGraphReady}
          timeSecondsAt={graphTimeSecondsAt}
        />
        <WorkstreamSwitchTransition transition={switchTransition} />
        <NowRail
          activity={snapshotView.activity}
          history={snapshotView.history}
          loadState={director.loadState}
          message={director.message}
          onOpenHistory={openHistory}
          receiptText={director.receiptText}
          workstream={snapshotView.selectedWorkstream}
        />
        <ArtifactsRail
          approvals={snapshotView.approvals}
          artifacts={snapshotView.artifacts}
          dispatch={director.dispatch}
          dispatching={director.dispatching}
          openLocalFolder={workspaceBinding.openLocalFolder}
          readArtifact={setta.conversations.readArtifact}
          requests={snapshotView.requests}
          workspaceSession={workspaceBinding.session}
        />
        <DirectorComposer
          commitment={directorComposerCommitment(snapshotView.selectedWorkstream)}
          dispatch={director.dispatch}
          dispatching={director.dispatching}
          onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
          speechCapture={speechCapture}
        />
        <DirectorHistoryOverlaySlot
          history={snapshotView.history}
          isOpen={historyOpen}
          onClose={closeHistory}
        />
      </section>
    </main>
  );
}

function useDirectorRuntime(
  setta: SettaAPI,
  speechPlayback: AppShellSpeechPlaybackController,
): DirectorRuntimeState & {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
} {
  const [snapshot, setSnapshotState] = useState<DirectorSnapshot | null>(null);
  const [loadState, setLoadState] = useState<DirectorLoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const snapshotRef = useRef<DirectorSnapshot | null>(null);
  const refreshRef = useRef<((state: DirectorLoadState) => Promise<void>) | null>(null);

  const setSnapshot = useCallback((next: DirectorSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let disposeEvents: (() => void) | null = null;
    let refreshInFlight = false;
    let pendingVisibleFrame: number | null = null;

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

    const refresh = async (state: DirectorLoadState): Promise<void> => {
      if (refreshInFlight || disposed) {
        return;
      }
      refreshInFlight = true;
      cancelPendingVisibleFrame();
      setLoadState(state);
      setMessage(state === "resyncing" ? "Resyncing Director state." : null);
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
      } finally {
        refreshInFlight = false;
      }
    };

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

    refreshRef.current = refresh;
    void refresh("loading");
    return () => {
      disposed = true;
      cancelPendingVisibleFrame();
      refreshRef.current = null;
      disposeEvents?.();
    };
  }, [setSnapshot, setta]);

  const dispatch = useCallback(
    async (intent: DirectorIntent): Promise<DirectorReceipt> => {
      const usesBusyState = directorIntentUsesBusyState(intent);
      if (intent.kind === "submit") {
        speechPlayback.preemptForUserInput();
      }
      if (usesBusyState) {
        setDispatching(true);
      }
      setMessage(null);
      try {
        const receipt = await setta.director.dispatch(intent);
        setReceiptText(receipt.submit?.publicText || null);
        if (intent.kind === "submit") {
          void enqueueDirectorSpeechPlayback({
            controller: speechPlayback,
            readMasterVoiceSelection: setta.speech.readMasterVoiceSelection,
            receipt,
          }).catch((error: unknown) => {
            console.info(`Director speech playback unavailable: ${directorErrorMessage(error)}`);
          });
        }
        return receipt;
      } catch (error) {
        setMessage("The Director could not accept that request.");
        throw error;
      } finally {
        if (usesBusyState) {
          setDispatching(false);
        }
      }
    },
    [setta, speechPlayback],
  );

  return { dispatch, dispatching, loadState, message, receiptText, snapshot };
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
  const selectedGraph = visibleSelectedGraph(snapshot);
  return {
    activity: currentDirectorActivity(selectedGraph),
    approvals: snapshot.unresolvedApprovals,
    artifacts: snapshot.artifacts,
    history: compactDirectorHistory(selectedGraph),
    requests: snapshot.unresolvedResourceRequests,
    selectedWorkstream: selectedWorkstreamEntry(snapshot)?.workstream ?? null,
  };
}

function emptyCommandCenterSnapshotView(): DirectorCommandCenterSnapshotView {
  return {
    activity: [],
    approvals: [],
    artifacts: [],
    history: [],
    requests: [],
    selectedWorkstream: null,
  };
}

function directorRailVisibilityAttributes(visibility: DirectorRailVisibility) {
  return {
    artifacts: visibility.artifacts ? "shown" : "hidden",
    now: visibility.now ? "shown" : "hidden",
  };
}

function useDirectorHistoryDialog() {
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const open = useCallback((trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  return { close, isOpen, open };
}

function useDirectorRailDisclosure() {
  const [railVisibility, setRailVisibility] =
    useState<DirectorRailVisibility>(defaultRailVisibility);
  const [compactRail, setCompactRail] = useState<DirectorCompactRail>(null);
  const compact = useCompactRailLayout();
  const effectiveVisibility = effectiveDirectorRailVisibility({
    compact,
    compactRail,
    railVisibility,
  });
  const closeCompactRail = useCallback(() => {
    setCompactRail(null);
  }, []);
  const toggleRail = useCallback(
    (rail: Exclude<DirectorCompactRail, null>) => {
      if (compact) {
        setCompactRail((current) => (current === rail ? null : rail));
        return;
      }
      setRailVisibility((current) => ({ ...current, [rail]: !current[rail] }));
    },
    [compact],
  );
  return { closeCompactRail, compactRail, effectiveVisibility, toggleRail };
}

function useDirectorShellKeyboardNavigation({
  closeCompactRail,
  closeHistory,
  compactRail,
  dispatch,
  historyOpen,
}: {
  closeCompactRail: () => void;
  closeHistory: () => void;
  compactRail: DirectorCompactRail;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  historyOpen: boolean;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        if (historyOpen || compactRail !== null) {
          event.preventDefault();
          if (historyOpen) {
            closeHistory();
          }
          closeCompactRail();
        }
        return;
      }
      const direction = directorWorkstreamKeyboardDirection({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        targetIsEditable: directorKeyboardTargetIsEditable(event.target),
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
  }, [closeCompactRail, closeHistory, compactRail, dispatch, historyOpen]);
}

function useDirectorSpeechCapture({
  dispatch,
  runtimeId,
  setta,
  speechPlayback,
}: {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  runtimeId: string | null;
  setta: SettaAPI;
  speechPlayback: AppShellSpeechPlaybackController;
}): DirectorSpeechCaptureBinding {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const [controller] = useState(
    () =>
      new DirectorSpeechCaptureController({
        captureProvider: createBrowserVoiceInputProvider(setta),
        clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
        createCaptureSessionId: () => globalThis.crypto.randomUUID(),
        dispatchDirectorIntent: (intent) => dispatchRef.current(intent),
        onCaptureEnd: speechPlayback.resumeAfterCapture,
        onCaptureStart: speechPlayback.preemptForCapture,
        setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
      }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    const unregister = registerRendererPageTeardown(() => controller.dispose());
    return () => {
      unregister();
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => {
    void controller.synchronizeRuntime(runtimeId);
  }, [controller, runtimeId]);
  useEffect(() => subscribeSpeechCapabilityRefresh(setta, controller), [controller, setta]);

  return { controller, snapshot };
}

function NowRail({
  activity,
  history,
  loadState,
  message,
  onOpenHistory,
  receiptText,
  workstream,
}: {
  activity: DirectorNowActivity;
  history: DirectorHistory;
  loadState: DirectorLoadState;
  message: string | null;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  receiptText: string | null;
  workstream: Workstream | null;
}) {
  return (
    <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
      <CurrentWorkstreamSummary workstream={workstream} />
      <DirectorNowActivityList activity={activity} />
      <HistoryList history={history} onOpenHistory={onOpenHistory} />
      <div aria-live="polite" className="director-live-status" role="status">
        {message ?? receiptText ?? loadStateMessage(loadState)}
      </div>
    </aside>
  );
}

function CurrentWorkstreamSummary({ workstream }: { workstream: Workstream | null }) {
  const status = workstream?.status ?? "idle";
  const summary = directorCurrentWorkstreamSummary(workstream);
  return (
    <section className="director-rail-section">
      <p className="director-rail-kicker">Now</p>
      <h1>{workstream?.title ?? "Setta"}</h1>
      <div className="director-selected-status">
        <StatusGlyph status={status} />
        <span>{directorWorkstreamStatusLabels[status]}</span>
      </div>
      {summary ? <p className="director-rail-summary">{summary}</p> : null}
    </section>
  );
}

export function directorCurrentWorkstreamSummary(workstream: Workstream | null): string | null {
  const milestone = workstream?.lastMilestone;
  if (!workstream || !milestone) {
    return null;
  }
  const rule = currentWorkstreamSummaryRules[workstream.status];
  if (rule === null) {
    return null;
  }
  if (rule === "milestone") {
    return milestone.publicSummary;
  }
  return milestone.kind === rule ? milestone.publicSummary : null;
}

function HistoryList({
  history,
  onOpenHistory,
}: {
  history: DirectorHistory;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="director-rail-section" aria-label="Recent work">
      <p className="director-rail-kicker">History</p>
      {history.length > 0 ? (
        <>
          <ol className="director-history-list">
            {history.slice(-3).map((node) => (
              <li data-node-kind={node.kind} key={node.id}>
                <span>{node.publicSummary}</span>
              </li>
            ))}
          </ol>
          <button
            className="director-history-open"
            onClick={(event) => onOpenHistory(event.currentTarget)}
            type="button"
          >
            <History aria-hidden="true" size={14} />
            <span>See thread history</span>
          </button>
        </>
      ) : (
        <p className="director-rail-summary">No work has been selected.</p>
      )}
    </section>
  );
}

function packDirectorGraphs(graphs: DirectorSnapshot["graphs"] | undefined) {
  if (graphs === undefined || graphs.length === 0) {
    return emptyPackedGraphSnapshot(directorGraphCompositionId);
  }
  return packSemanticGraphComposition({
    graphs,
    workstreamId: directorGraphCompositionId,
  });
}

export function directorGraphTimeSecondsAt(
  snapshot: DirectorSnapshot | null,
  frameAnchorMs = globalThis.performance?.now() ?? 0,
): (timestampMs: number) => number {
  const graphs = snapshot?.graphs ?? [];
  const origin = semanticGraphTimeOriginSeconds(graphs);
  if (snapshot === null || origin === null) {
    return (timestampMs) => Math.max(0, timestampMs - frameAnchorMs) / 1000;
  }
  const committedAt = latestDirectorGraphTimeSeconds(snapshot, origin);
  const relativeAtAnchor = Math.max(0, committedAt - origin);
  return (timestampMs) => relativeAtAnchor + (timestampMs - frameAnchorMs) / 1000;
}

function latestDirectorGraphTimeSeconds(snapshot: DirectorSnapshot, fallback: number): number {
  let latest = timestampSeconds(snapshot.connection.lastEventAt) ?? fallback;
  for (const graph of snapshot.graphs) {
    for (const node of graph.nodes) {
      latest = Math.max(
        latest,
        timestampSeconds(node.createdAt) ?? fallback,
        timestampSeconds(node.updatedAt) ?? fallback,
        timestampSeconds(node.completedAt) ?? fallback,
      );
    }
  }
  return latest;
}

function timestampSeconds(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

export function directorEventChangesVisibleState(event: DirectorEvent): boolean {
  return directorEventVisibility[event.kind];
}

function directorIntentUsesBusyState(intent: DirectorIntent): boolean {
  return directorIntentBusyState[intent.kind];
}

function dispatchDirectorIntent(
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>,
  intent: DirectorIntent,
): void {
  void dispatch(intent).catch(() => {});
}

function loadStateMessage(state: DirectorLoadState): string {
  switch (state) {
    case "loading":
      return "Loading Director state.";
    case "resyncing":
      return "Resyncing Director state.";
    case "error":
      return "The Director command center is unavailable.";
    case "ready":
      return "";
    default:
      return exhaustiveLoadState(state);
  }
}

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
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const matchMedia = globalThis.window?.matchMedia;
    if (!matchMedia) {
      return;
    }
    const query = matchMedia(compactRailQuery);
    const update = (): void => {
      setCompact(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);
  return compact;
}

function directorKeyboardTargetIsEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(target.closest("input, textarea, select, [contenteditable='true']")))
  );
}

function exhaustiveLoadState(state: never): never {
  throw new Error(`unsupported Director load state ${state}`);
}

function directorErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "unknown Director speech playback failure";
}
