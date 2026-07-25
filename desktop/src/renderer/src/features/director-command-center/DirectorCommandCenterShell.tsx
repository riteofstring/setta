import type {
  DirectorEvent,
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  Workstream,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";
import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { ChevronDown, Folder, History } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import { useWorkspaceStore } from "../../stores/workspace-store";
import {
  AppShellSpeechCaptureEffectLifetime,
  subscribeSpeechCapabilityRefresh,
} from "../global-speech/speech-capture-lifecycle";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import { createBrowserVoiceInputProvider } from "../global-speech/browser-voice-input-provider";
import { emptyPackedGraphSnapshot } from "../director-graph/packed-graph-snapshot";
import {
  packSemanticGraphComposition,
  semanticGraphTimeOriginSeconds,
} from "../director-graph/semantic-graph-packer";
import { DirectorGraphSurface } from "../director-graph/render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../director-graph/render/director-graph-canvas";
import {
  DirectorComposer,
  directorComposerInputId,
  directorComposerTakesKeystroke,
  focusDirectorComposer,
  type DirectorSpeechCaptureBinding,
} from "./DirectorComposer";
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
import { directorFocus, type DirectorFocus } from "./director-focus";
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

/*
 * The width at which a rail stops flanking the canvas and becomes a card laid
 * over it. Below it the two rails would cover each other, so opening one closes
 * the other. The same breakpoint draws the compact layout in
 * `director-command-center.css`; the state machine and the layout have to agree
 * on when a rail floats.
 */
const compactRailQuery = "(max-width: 760px)";
const directorGraphCompositionId = "director-command-center";
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
  const focus = directorFocus(snapshotView.selectedWorkstream);
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
      <div
        aria-hidden={historyOpen || undefined}
        className="director-command-center-content"
        inert={historyOpen || undefined}
      >
        <a className="director-command-center-skip" href={`#${directorComposerInputId}`}>
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
            ambientMotion
            label="Director semantic graph"
            onReady={onGraphReady}
            timeSecondsAt={graphTimeSecondsAt}
          />
          <WorkstreamSwitchTransition transition={switchTransition} />
          <NowRail
            activity={snapshotView.activity}
            focus={focus}
            history={snapshotView.history}
            loadState={director.loadState}
            message={director.message}
            onOpenHistory={openHistory}
            receiptText={director.receiptText}
          />
          <ArtifactsRail
            approvals={snapshotView.approvals}
            artifacts={snapshotView.artifacts}
            dispatch={director.dispatch}
            dispatching={director.pending.dispatching}
            openLocalFolder={workspaceBinding.openLocalFolder}
            openWorkspacePath={workspaceBinding.openWorkspacePath}
            readArtifact={setta.conversations.readArtifact}
            requests={snapshotView.requests}
            workspaceSession={workspaceBinding.session}
          />
          <DirectorComposer
            answering={director.pending.answering}
            dispatch={director.dispatch}
            focus={focus}
            onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
            speechCapture={speechCapture}
          />
        </section>
      </div>
      <DirectorHistoryOverlaySlot
        history={snapshotView.history}
        isOpen={historyOpen}
        onClose={closeHistory}
      />
    </main>
  );
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
        setMessage(requestedState === "resyncing" ? "Resyncing Director state." : null);
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
  openWorkspacePath: (rootPath: string) => Promise<WorkspaceSummary>;
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
  const openWorkspacePath = useCallback(
    async (rootPath: string): Promise<WorkspaceSummary> => {
      const response = await setta.workspace.openPath(rootPath);
      applyWorkspaceSession(response.session);
      return response.workspace;
    },
    [applyWorkspaceSession, setta],
  );
  return { openLocalFolder, openWorkspacePath, session };
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
  const wasOpenRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const open = useCallback((trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useLayoutEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      const trigger = triggerRef.current;
      if (trigger !== null && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
      triggerRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);
  return { close, isOpen, open };
}

function useDirectorRailDisclosure() {
  const [railVisibility, setRailVisibility] =
    useState<DirectorRailVisibility>(defaultRailVisibility);
  const [compactRail, setCompactRail] = useState<DirectorCompactRail>(null);
  const compactRailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasCompactRailOpenRef = useRef(false);
  const compact = useCompactRailLayout();
  const effectiveVisibility = effectiveDirectorRailVisibility({
    compact,
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
    if (!compact) {
      closeCompactRail();
    }
  }, [closeCompactRail, compact]);
  const toggleRail = useCallback(
    (rail: Exclude<DirectorCompactRail, null>, trigger: HTMLButtonElement) => {
      if (compact) {
        if (compactRail !== rail) {
          compactRailTriggerRef.current = trigger;
        }
        setCompactRail((current) => (current === rail ? null : rail));
        return;
      }
      setRailVisibility((current) => ({ ...current, [rail]: !current[rail] }));
    },
    [compact, compactRail],
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
      if (historyOpen) {
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

function NowRail({
  activity,
  focus,
  history,
  loadState,
  message,
  onOpenHistory,
  receiptText,
}: {
  activity: DirectorNowActivity;
  focus: DirectorFocus;
  history: DirectorHistory;
  loadState: DirectorLoadState;
  message: string | null;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  receiptText: string | null;
}) {
  return (
    <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
      <CurrentFocusSummary focus={focus} />
      <DirectorNowActivityList activity={activity} />
      <HistoryList history={history} onOpenHistory={onOpenHistory} />
      <div aria-live="polite" className="director-live-status" role="status">
        {message ?? receiptText ?? loadStateMessage(loadState)}
      </div>
    </aside>
  );
}

function CurrentFocusSummary({ focus }: { focus: DirectorFocus }) {
  return (
    <section className="director-rail-section" data-focus={focus.kind}>
      <p className="director-rail-kicker">Now</p>
      <h2>{focus.title}</h2>
      {focus.kind === "director" ? (
        <div className="director-selected-status">
          <span aria-hidden="true" className="director-role-dot" />
          <span>{focus.roleLabel}</span>
        </div>
      ) : (
        <CurrentWorkstreamFacts focus={focus} />
      )}
    </section>
  );
}

function CurrentWorkstreamFacts({
  focus,
}: {
  focus: Extract<DirectorFocus, { kind: "workstream" }>;
}) {
  return (
    <>
      <div className="director-focus-facts">
        <div className="director-selected-status" data-status={focus.status}>
          <StatusGlyph status={focus.status} />
          <span>{focus.statusLabel}</span>
        </div>
        <div
          className="director-selected-folder"
          data-folder={focus.folder.path === null ? "none" : "bound"}
        >
          <Folder aria-hidden="true" size={14} />
          <span className="sr-only">Folder: </span>
          <span title={focus.folder.path ?? undefined}>{focus.folder.label}</span>
        </div>
      </div>
      {focus.summary === null ? null : (
        <CurrentWorkstreamSummaryDisclosure summary={focus.summary} />
      )}
    </>
  );
}

function CurrentWorkstreamSummaryDisclosure({ summary }: { summary: string }) {
  return (
    <details className="director-summary-disclosure">
      <summary>
        <span>Summary</span>
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <p className="director-rail-summary">{summary}</p>
    </details>
  );
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
        <p className="director-rail-summary">No workstream history yet.</p>
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
  const [compact, setCompact] = useState(
    () => globalThis.window?.matchMedia?.(compactRailQuery).matches ?? false,
  );
  useEffect(() => {
    const query = globalThis.window?.matchMedia?.(compactRailQuery);
    if (!query) {
      return;
    }
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
