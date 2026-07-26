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
import { applyDirectorEvent, selectedWorkstreamEntry } from "./director-command-center-state";
import { enqueueDirectorSpeechPlayback } from "./director-speech-playback";
import { DirectorSpeechCaptureController } from "./director-speech-capture";
import { ArtifactBrowserOverlaySlot } from "./ArtifactBrowserOverlaySlot";
import { ArtifactsRail } from "./DirectorArtifactsRail";
import {
  createWorkstreamIntent,
  PendingActions,
  workspaceWorkstreamTitle,
} from "./DirectorPendingActions";
import { NowRail, type DirectorLoadState } from "./DirectorNowRail";
import { useDirectorArtifactBrowser } from "./director-artifact-browser";
import {
  useDirectorWorkstreamSwitchTransition,
  WorkstreamSwitchTransition,
} from "./director-workstream-switch-transition";
import { directorFocus, type DirectorFocus } from "./director-focus";
import {
  directorConversationInputId,
  directorSubmitIntent,
  submitToWorkstreamConversation,
} from "./director-view-submit";
import {
  CommandCenterTopBar,
  directorWorkstreamKeyboardDirection,
  moveSelectionIntent,
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
  // Selection is a view: no workstream means the Director's own.
  const onDirectorView = (director.snapshot?.selectedWorkstreamId ?? null) === null;
  const {
    closeCompactRail,
    compactRail,
    effectiveVisibility: effectiveRailVisibility,
    toggleRail,
  } = useDirectorRailDisclosure(onDirectorView);
  const snapshotGraphs = director.snapshot?.graphs;
  const graphTimeSecondsAt = useMemo(
    () => directorGraphTimeSecondsAt(director.snapshot),
    [director.snapshot?.connection.lastEventAt, snapshotGraphs],
  );
  const packedSnapshot = useMemo(
    () => packDirectorGraphs(snapshotGraphs, director.snapshot?.selectedWorkstreamId ?? null),
    [snapshotGraphs, director.snapshot?.selectedWorkstreamId],
  );
  const railAttributes = directorRailVisibilityAttributes(effectiveRailVisibility);
  const focus = directorFocus(snapshotView.selectedWorkstream);
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
      const selected = snapshotView.selectedWorkstream;
      if (selected === null) {
        const receipt = await director.dispatch(directorSubmitIntent(text));
        return receipt.submit?.replyText ?? null;
      }
      const result = await submitToWorkstreamConversation({
        conversationId: selected.conversationId,
        newInputId: directorConversationInputId,
        now: () => new Date().toISOString(),
        setta,
        text,
        workstreamTitle: selected.title,
      });
      director.reportReceipt(result.receiptText);
      return result.receiptText;
    },
    [director.dispatch, director.reportReceipt, setta, snapshotView.selectedWorkstream],
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
  const startWorkstreamInFolder = useCallback(() => {
    void (async () => {
      const workspace = await workspaceBinding.openLocalFolder();
      if (workspace === null) {
        return;
      }
      await director.dispatch(
        createWorkstreamIntent(workspace.id, workspaceWorkstreamTitle(workspace)),
      );
    })();
  }, [director.dispatch, workspaceBinding.openLocalFolder]);

  useEffect(() => {
    canvas?.setSnapshot(packedSnapshot);
  }, [canvas, packedSnapshot]);

  useDirectorShellKeyboardNavigation({
    artifactBrowserOpen: artifactBrowser.activeArtifact !== null,
    closeCompactRail,
    compactRail,
    dispatch: director.dispatch,
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
        aria-hidden={contentInert || undefined}
        className="director-command-center-content"
        inert={contentInert || undefined}
      >
        <a className="director-command-center-skip" href={`#${directorComposerInputId}`}>
          Skip to composer
        </a>
        <CommandCenterTopBar
          dispatch={director.dispatch}
          onStartWorkstream={startWorkstreamInFolder}
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
          {packedSnapshot.nodeCount === 0 ? <GraphEmptyState focus={focus} /> : null}
          <NowRail
            narration={snapshotView.narration}
            loadState={director.loadState}
            message={director.message}
            receiptText={director.receiptText}
          />
          <ArtifactsRail
            approvals={snapshotView.approvals}
            artifactBrowser={artifactBrowser}
            artifacts={snapshotView.artifacts}
            requests={snapshotView.requests}
          />
          {/*
           * Waiting-on-you and the composer share a dock so they stack in one
           * column above the canvas. They are siblings, not nested: an approval
           * renders its own form, and a form inside the composer's form is
           * dropped by the parser, which silently kills the approval's submit.
           */}
          <div className="director-composer-dock">
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
          </div>
        </section>
      </div>
      <ArtifactBrowserOverlaySlot browser={artifactBrowser} />
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

function useDirectorRuntime(
  setta: SettaAPI,
  speechPlayback: AppShellSpeechPlaybackController,
  runtimeId: string | null,
): DirectorRuntimeState & {
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  reportReceipt: (text: string) => void;
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

  /*
   * A receipt the shell wrote rather than the Director. Input sent to a
   * workstream's conversation is routed by the conversation router, so what
   * happened to it is reported here rather than arriving in a Director receipt.
   */
  const reportReceipt = useCallback((text: string) => {
    setReceiptText(text);
  }, []);
  return { dispatch, loadState, message, pending, receiptText, reportReceipt, snapshot };
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
     * An artifact belongs to the thread that produced it, so a workstream's
     * view lists its own. The Director's view lists none: it has no rails, and
     * every artifact is one arrow away in the thread that made it.
     */
    artifacts:
      selected === null
        ? []
        : snapshot.artifacts.filter((artifact) => artifact.workstreamId === selected.id),
    narration: selected?.narration ?? [],
    requests: snapshot.unresolvedResourceRequests,
    selectedWorkstream: selected,
  };
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

function directorRailVisibilityAttributes(visibility: DirectorRailVisibility) {
  return {
    artifacts: visibility.artifacts ? "shown" : "hidden",
    now: visibility.now ? "shown" : "hidden",
  };
}

function useDirectorRailDisclosure(onDirectorView: boolean) {
  const [railVisibility, setRailVisibility] =
    useState<DirectorRailVisibility>(defaultRailVisibility);
  const [compactRail, setCompactRail] = useState<DirectorCompactRail>(null);
  const compactRailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasCompactRailOpenRef = useRef(false);
  const compact = useCompactRailLayout();
  const effectiveVisibility = effectiveDirectorRailVisibility({
    compact,
    compactRail,
    onDirectorView,
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
      // The artifact browser is a modal Dialog: it owns Escape, arrow keys, and
      // every keystroke inside it, so the shell's own shortcuts stand down
      // rather than steering the graph or the composer behind it.
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

/*
 * The canvas draws the view you are on.
 *
 * The Director's view is the whole constellation — every workstream at once,
 * and its own lane with them — because that is what the Director sees. A
 * workstream's view is that workstream alone.
 *
 * The composition used to be permanent, which is why selection had no visible
 * consequence here and why the canvas failing to follow it had no agreed fix:
 * there was no answer to what it should show.
 */
export function packDirectorGraphs(
  graphs: DirectorSnapshot["graphs"] | undefined,
  selectedWorkstreamId: string | null,
) {
  const composed = graphs ?? [];
  const visible =
    selectedWorkstreamId === null
      ? composed
      : composed.filter((graph) => graph.workstreamId === selectedWorkstreamId);
  if (visible.length === 0) {
    return emptyPackedGraphSnapshot(directorGraphCompositionId);
  }
  return packSemanticGraphComposition({
    graphs: visible,
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

/*
 * Which rails the current view has.
 *
 * The Director's view has none. Its canvas is the content — every workstream
 * at once — and a rail over it names the first column rather than sitting
 * beside it. An artifact belongs to the thread that produced it and is one
 * arrow away, and what needs an answer rides the composer, where it can be
 * acted on rather than only reported.
 */
export function effectiveDirectorRailVisibility({
  compact,
  compactRail,
  onDirectorView,
  railVisibility,
}: {
  compact: boolean;
  compactRail: DirectorCompactRail;
  onDirectorView: boolean;
  railVisibility: DirectorRailVisibility;
}): DirectorRailVisibility {
  if (onDirectorView) {
    return { artifacts: false, now: false };
  }
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

function directorErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "unknown Director speech playback failure";
}
