import type {
  DirectorEvent,
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  Workstream,
  WorkstreamGraph,
  WorkstreamStatus,
  WorkspaceSession,
} from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  LoaderCircle,
  Settings,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { SettaLogoMark } from "../../components/setta-logo-mark";
import { useAppWindowDragHandlers } from "../../app-window-drag";
import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import { subscribeSpeechCapabilityRefresh } from "../global-speech/app-shell-speech-capture";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import { createBrowserVoiceInputProvider } from "../global-speech/browser-voice-input-provider";
import { emptyPackedGraphSnapshot } from "../director-graph/packed-graph-snapshot";
import { packSemanticGraphComposition } from "../director-graph/semantic-graph-packer";
import { DirectorGraphSurface } from "../director-graph/render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../director-graph/render/director-graph-canvas";
import { DirectorComposer, type DirectorSpeechCaptureBinding } from "./DirectorComposer";
import {
  applyDirectorEvent,
  selectedWorkstreamEntry,
  visibleSelectedGraph,
} from "./director-command-center-state";
import { enqueueDirectorSpeechPlayback } from "./director-speech-playback";
import { DirectorSpeechCaptureController } from "./director-speech-capture";
import { ArtifactsRail } from "./DirectorArtifactsRail";

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

const graphClock = {
  secondsAt: (timestampMs: number) => timestampMs / 1000,
};

const statusLabels = {
  archived: "Archived",
  awaiting_approval: "Approval",
  awaiting_resource: "Needs folder",
  blocked: "Blocked",
  completed: "Done",
  failed: "Failed",
  idle: "Idle",
  queued: "Queued",
  running: "Running",
} as const satisfies Record<WorkstreamStatus, string>;

const statusGlyphs = {
  archived: { Icon: Circle, size: 12 },
  awaiting_approval: { Icon: AlertTriangle, size: 14 },
  awaiting_resource: { Icon: AlertTriangle, size: 14 },
  blocked: { Icon: AlertTriangle, size: 14 },
  completed: { Icon: Check, size: 14 },
  failed: { Icon: X, size: 14 },
  idle: { Icon: Circle, size: 12 },
  queued: { Icon: Square, size: 13 },
  running: { Icon: LoaderCircle, size: 14 },
} as const satisfies Record<WorkstreamStatus, { Icon: LucideIcon; size: number }>;

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
  const workspaceSession = useWorkspaceSession(setta);
  const selectedEntry = selectedWorkstreamEntry(director.snapshot);
  const selectedGraph = visibleSelectedGraph(director.snapshot);
  const selectedWorkstream = selectedEntry?.workstream ?? null;
  const [canvas, setCanvas] = useState<DirectorGraphCanvas | null>(null);
  const packedSnapshot = useMemo(
    () => packDirectorSnapshot(director.snapshot),
    [director.snapshot],
  );
  const onGraphReady = useCallback((host: DirectorGraphCanvas | null) => {
    setCanvas(host);
  }, []);

  useEffect(() => {
    canvas?.setSnapshot(packedSnapshot);
  }, [canvas, packedSnapshot]);

  return (
    <main
      className="director-command-center"
      data-desktop-platform={platform}
      data-testid="director-command-center-shell"
    >
      <a className="director-command-center-skip" href="#director-composer-input">
        Skip to composer
      </a>
      <CommandCenterTopBar
        dispatch={director.dispatch}
        onOpenSettingsPage={onOpenSettingsPage}
        platform={platform}
        snapshot={director.snapshot}
      />
      <section className="director-command-center-stage" aria-label="Director command center">
        <DirectorGraphSurface
          label="Director semantic graph"
          onReady={onGraphReady}
          timeSecondsAt={graphClock.secondsAt}
        />
        <NowRail
          graph={selectedGraph}
          loadState={director.loadState}
          message={director.message}
          receiptText={director.receiptText}
          snapshot={director.snapshot}
          workstream={selectedWorkstream}
        />
        <ArtifactsRail
          approvals={director.snapshot?.unresolvedApprovals ?? []}
          artifacts={director.snapshot?.artifacts ?? []}
          dispatch={director.dispatch}
          dispatching={director.dispatching}
          readArtifact={setta.conversations.readArtifact}
          requests={director.snapshot?.unresolvedResourceRequests ?? []}
          workspaceSession={workspaceSession}
        />
        <DirectorComposer
          dispatch={director.dispatch}
          dispatching={director.dispatching}
          onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
          speechCapture={speechCapture}
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

    const refresh = async (state: DirectorLoadState): Promise<void> => {
      if (refreshInFlight || disposed) {
        return;
      }
      refreshInFlight = true;
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
        setSnapshot(applyDirectorEvent(current, event));
      } catch {
        void refresh("resyncing");
      }
    };

    refreshRef.current = refresh;
    void refresh("loading");
    return () => {
      disposed = true;
      refreshRef.current = null;
      disposeEvents?.();
    };
  }, [setSnapshot, setta]);

  const dispatch = useCallback(
    async (intent: DirectorIntent): Promise<DirectorReceipt> => {
      speechPlayback.preemptForUserInput();
      setDispatching(true);
      setMessage(null);
      try {
        const receipt = await setta.director.dispatch(intent);
        setReceiptText(receipt.submit?.publicText || null);
        void enqueueDirectorSpeechPlayback({
          controller: speechPlayback,
          readMasterVoiceSelection: setta.speech.readMasterVoiceSelection,
          receipt,
        }).catch((error: unknown) => {
          console.info(`Director speech playback unavailable: ${directorErrorMessage(error)}`);
        });
        return receipt;
      } catch (error) {
        setMessage("The Director could not accept that request.");
        throw error;
      } finally {
        setDispatching(false);
      }
    },
    [setta, speechPlayback],
  );

  return { dispatch, dispatching, loadState, message, receiptText, snapshot };
}

function useWorkspaceSession(setta: SettaAPI): WorkspaceSession | null {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  useEffect(() => {
    let disposed = false;
    void setta.workspace
      .session()
      .then((next) => {
        if (!disposed) {
          setSession(next);
        }
      })
      .catch(() => {
        if (!disposed) {
          setSession(null);
        }
      });
    return () => {
      disposed = true;
    };
  }, [setta]);
  return session;
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

function CommandCenterTopBar({
  dispatch,
  onOpenSettingsPage,
  platform,
  snapshot,
}: {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  onOpenSettingsPage: () => void;
  platform: DesktopPlatform;
  snapshot: DirectorSnapshot | null;
}) {
  const windowDragHandlers = useAppWindowDragHandlers();
  const workstreams = snapshot?.workstreams.slice(0, 8) ?? [];
  return (
    <header
      className="director-command-center-top app-drag"
      data-desktop-platform={platform}
      data-setta-shell-title-bar="true"
      data-testid="director-command-center-top-bar"
      {...windowDragHandlers}
    >
      <div aria-hidden="true" className="director-command-center-chrome-shield app-no-drag" />
      <div className="director-command-center-brand">
        <SettaLogoMark height={13} />
      </div>
      <nav aria-label="Workstreams" className="director-workstream-nav app-no-drag">
        <IconButton
          label="Previous workstream"
          onClick={() => dispatch(moveSelectionIntent("previous"))}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </IconButton>
        <div className="director-workstream-strip" role="list">
          {workstreams.map((entry) => (
            <button
              aria-current={
                entry.workstream.id === snapshot?.selectedWorkstreamId ? "page" : undefined
              }
              className="director-workstream-tab"
              data-status={entry.workstream.status}
              data-workstream-id={entry.workstream.id}
              key={entry.workstream.id}
              onClick={() => dispatch(selectWorkstreamIntent(entry.workstream.id))}
              type="button"
            >
              <StatusGlyph status={entry.workstream.status} />
              <span>{entry.workstream.title}</span>
            </button>
          ))}
        </div>
        <IconButton label="Next workstream" onClick={() => dispatch(moveSelectionIntent("next"))}>
          <ChevronRight aria-hidden="true" size={16} />
        </IconButton>
      </nav>
      <IconButton label="Open settings" onClick={onOpenSettingsPage}>
        <Settings aria-hidden="true" size={16} />
      </IconButton>
    </header>
  );
}

function NowRail({
  graph,
  loadState,
  message,
  receiptText,
  snapshot,
  workstream,
}: {
  graph: WorkstreamGraph | null;
  loadState: DirectorLoadState;
  message: string | null;
  receiptText: string | null;
  snapshot: DirectorSnapshot | null;
  workstream: Workstream | null;
}) {
  const history = useMemo(() => compactHistory(graph), [graph]);
  return (
    <aside aria-label="Now" className="director-now-rail">
      <CurrentWorkstreamSummary workstream={workstream} />
      <AggregateGrid snapshot={snapshot} />
      <HistoryList history={history} />
      <div aria-live="polite" className="director-live-status" role="status">
        {message ?? receiptText ?? loadStateMessage(loadState)}
      </div>
    </aside>
  );
}

function CurrentWorkstreamSummary({ workstream }: { workstream: Workstream | null }) {
  const status = workstream?.status ?? "idle";
  return (
    <section className="director-rail-section">
      <p className="director-rail-kicker">Now</p>
      <h1>{workstream?.title ?? "Setta"}</h1>
      <div className="director-selected-status">
        <StatusGlyph status={status} />
        <span>{statusLabels[status]}</span>
      </div>
      {workstream?.lastMilestone ? (
        <p className="director-rail-summary">{workstream.lastMilestone.publicSummary}</p>
      ) : null}
    </section>
  );
}

function AggregateGrid({ snapshot }: { snapshot: DirectorSnapshot | null }) {
  return (
    <section className="director-rail-section director-aggregate-grid" aria-label="Status totals">
      <Aggregate label="Running" value={snapshot?.aggregates.runningCount ?? 0} />
      <Aggregate label="Blocked" value={snapshot?.aggregates.blockedCount ?? 0} />
      <Aggregate label="Queued" value={snapshot?.aggregates.queuedCount ?? 0} />
      <Aggregate label="Artifacts" value={snapshot?.aggregates.artifactCount ?? 0} />
    </section>
  );
}

function HistoryList({ history }: { history: ReturnType<typeof compactHistory> }) {
  return (
    <section className="director-rail-section" aria-label="Recent work">
      <p className="director-rail-kicker">History</p>
      {history.length > 0 ? (
        <ol className="director-history-list">
          {history.map((node) => (
            <li data-node-kind={node.kind} key={node.id}>
              <span>{node.publicSummary}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="director-rail-summary">No work has been selected.</p>
      )}
    </section>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} className="director-icon-button" onClick={onClick} type="button">
      {children}
    </button>
  );
}

function StatusGlyph({ status }: { status: WorkstreamStatus }) {
  const { Icon, size } = statusGlyphs[status];
  return <Icon aria-hidden="true" className="director-status-icon" size={size} />;
}

function Aggregate({ label, value }: { label: string; value: number }) {
  return (
    <div className="director-aggregate">
      <span>{value}</span>
      <span>{label}</span>
    </div>
  );
}

function compactHistory(graph: WorkstreamGraph | null) {
  if (graph === null) {
    return [];
  }
  return graph.nodes
    .filter((node) =>
      ["user_goal", "director_decision", "milestone", "completed", "failed", "cancelled"].includes(
        node.kind,
      ),
    )
    .slice(-5);
}

function packDirectorSnapshot(snapshot: DirectorSnapshot | null) {
  if (snapshot === null || snapshot.graphs.length === 0) {
    return emptyPackedGraphSnapshot(snapshot?.selectedWorkstreamId ?? "director-empty");
  }
  return packSemanticGraphComposition({
    graphs: snapshot.graphs,
    workstreamId: snapshot.selectedWorkstreamId ?? "director",
  });
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

function selectWorkstreamIntent(workstreamId: string): DirectorIntent {
  return {
    cancelRun: null,
    kind: "select_workstream",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: { workstreamId },
    submit: null,
  };
}

function moveSelectionIntent(direction: "previous" | "next"): DirectorIntent {
  return {
    cancelRun: null,
    kind: "move_selection",
    moveSelection: { direction },
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: null,
    submit: null,
  };
}

function exhaustiveLoadState(state: never): never {
  throw new Error(`unsupported Director load state ${state}`);
}

function directorErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "unknown Director speech playback failure";
}
