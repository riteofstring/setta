import { Check, Sparkles, Square, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { EasyArtifact, EasyHighlight, EasyRun, EasyRunFocusStatus } from "@generated/backend";
import type { EasyRunSteerResult } from "@shared/easy-run-ipc";

import { useEasyRunStore } from "../../stores/easy-run-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";
import {
  SpeechAvailabilityStatus,
  SpeechCaptureError,
  SpeechCaptureLine,
  SpeechCaptureRings,
  SpeechControlGlyph,
  speechCaptureControlLabel,
  speechCaptureDOMState,
  speechCaptureHelperCopy,
} from "./easy-button-speech-presentation";
import { ArtifactRail, HighlightRail } from "./easy-button-rails";
import type { SpeechCaptureState } from "./speech-capture-controller";
import {
  type EasyButtonSpeechCapture,
  type SpeechCaptureAvailability,
  useSpeechCapture,
} from "./use-speech-capture";

type EasyButtonViewState = "idle" | "working" | "complete";

// `viewState` collapses the three terminal run statuses into `complete`, which is
// all the layout and the pane title need. The tone of a terminal state is a
// different question — a stopped or failed run must never wear the success
// visuals — so the run status rides alongside it rather than inside it.
type EasyButtonStatusTone = "none" | "completed" | "failed" | "stopped";

const confirmPulseDurationMs = 1000;

export function EasyButtonSurface() {
  const controller = useEasyButtonController();
  return (
    <section
      aria-label="Easy Button"
      className="easy-button-surface"
      data-easy-button-capture={speechCaptureDOMState(controller.capture.state)}
      data-easy-button-capturing={controller.capture.active ? "true" : "false"}
      data-easy-button-focus={currentFocusStatus(controller.latestRun, controller.viewState)}
      data-easy-button-speech={controller.speechConfigured ? "configured" : "unavailable"}
      data-easy-button-state={controller.viewState}
      data-easy-button-status={controller.statusTone}
      data-testid="easy-button-surface"
      ref={controller.rootRef}
    >
      <HighlightRail highlights={controller.highlights} latestRun={controller.latestRun} />
      <main className="easy-button-stage">
        <div className="easy-button-center">
          <div className="easy-button-agent-chip-slot">
            <AgentChip
              activeAgentCount={controller.activeAgentCount}
              viewState={controller.viewState}
            />
          </div>
          <div className="easy-button-button-well">
            <SwirlField />
            <SpeechCaptureRings />
            <button
              aria-label={controller.controlLabel}
              className="easy-button-control"
              data-easy-button-confirm={controller.confirmActive ? "true" : "false"}
              data-testid="easy-button-control"
              disabled={controller.controlDisabled}
              onClick={controller.handleControlClick}
              type="button"
            >
              <ControlGlyph
                speechConfigured={controller.speechConfigured}
                statusTone={controller.statusTone}
                viewState={controller.viewState}
              />
            </button>
          </div>
          <CaptionSlot
            capture={controller.capture.state}
            error={controller.error}
            latestRun={controller.latestRun}
            speechAvailability={controller.capture.availability}
            speechConfigured={controller.speechConfigured}
            viewState={controller.viewState}
          />
          <div className="easy-button-action-slot">
            <StopButton
              disabled={controller.stopDisabled}
              onClick={controller.handleStopClick}
              viewState={controller.viewState}
            />
          </div>
        </div>
      </main>
      <ArtifactRail artifacts={controller.artifacts} />
      <form className="easy-button-footer" onSubmit={controller.handleSubmit}>
        <div className="easy-button-input-wrap">
          <input
            aria-label="Easy Button request"
            className="easy-button-input"
            data-testid="easy-button-input"
            disabled={controller.inputDisabled}
            onChange={(event) => controller.setInputValue(event.target.value)}
            onKeyDown={controller.handleInputKeyDown}
            placeholder="What should Setta do?"
            ref={controller.inputRef}
            type="text"
            value={controller.inputValue}
          />
          <span aria-hidden="true" className="easy-button-enter-chip">
            ⏎
          </span>
        </div>
      </form>
    </section>
  );
}

interface EasyButtonController {
  activeAgentCount: number;
  artifacts: EasyArtifact[];
  capture: EasyButtonSpeechCapture;
  confirmActive: boolean;
  controlDisabled: boolean;
  controlLabel: string;
  error: string | null;
  handleControlClick: () => void;
  handleInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleStopClick: () => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  inputDisabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  highlights: EasyHighlight[];
  latestRun: EasyRun | null;
  rootRef: RefObject<HTMLElement | null>;
  setInputValue: (value: string) => void;
  speechConfigured: boolean;
  statusTone: EasyButtonStatusTone;
  stopDisabled: boolean;
  viewState: EasyButtonViewState;
}

function useEasyButtonController(): EasyButtonController {
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const artifacts = useEasyRunStore((state) => state.artifacts);
  const error = useEasyRunStore((state) => state.error);
  const highlights = useEasyRunStore((state) => state.highlights);
  const latestRun = useEasyRunStore((state) => state.latestRun);
  const loadSnapshot = useEasyRunStore((state) => state.loadSnapshot);
  const resetStore = useEasyRunStore((state) => state.reset);
  const start = useEasyRunStore((state) => state.start);
  const steer = useEasyRunStore((state) => state.steer);
  const stop = useEasyRunStore((state) => state.stop);
  const [inputValue, setInputValue] = useState("");
  const [pendingAction, setPendingAction] = useState(false);
  const capture = useSpeechCapture({
    onCompletedTranscript: (transcript) => {
      setInputValue(transcript);
    },
    workspaceId: selectedWorkspaceId,
  });
  const viewState = easyButtonViewState(latestRun, pendingAction);
  const canSubmit = canSubmitRequest(selectedWorkspaceId, inputValue, latestRun, viewState);
  const submitRequest = useEasyButtonSubmit({
    canSubmit,
    inputRef,
    inputValue,
    latestRun,
    selectedWorkspaceId,
    setInputValue,
    setPendingAction,
    start,
    steer,
    viewState,
  });
  const stopRequest = useEasyButtonStop({
    cancelCapture: capture.cancel,
    inputRef,
    latestRun,
    selectedWorkspaceId,
    setPendingAction,
    stop,
  });
  const handleControlClick = useEasyButtonControlClick({
    capture,
    inputRef,
    latestRun,
    pendingAction,
    selectedWorkspaceId,
    viewState,
  });

  const statusTone = statusToneForState(viewState, latestRun);
  const speechConfigured = capture.availability.type === "configured";

  useEasyButtonSnapshot(selectedWorkspaceId, loadSnapshot, resetStore);
  useEasyButtonPaneTitle(rootRef, viewState, capture.state);
  useEasyButtonCaptureCancellation(capture, latestRun);
  const confirmActive = useEasyButtonConfirmPulse(viewState, statusTone, latestRun?.id ?? null);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitRequest();
    },
    [submitRequest],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      event.preventDefault();
      void submitRequest();
    },
    [submitRequest],
  );

  return {
    activeAgentCount: activeAgentCountForState(viewState, latestRun),
    artifacts,
    capture,
    confirmActive,
    controlDisabled: controlDisabled(selectedWorkspaceId, pendingAction, capture),
    controlLabel: speechConfigured
      ? speechCaptureControlLabel(capture.state, viewState === "working")
      : controlAriaLabel(viewState),
    error,
    handleControlClick,
    handleInputKeyDown,
    handleStopClick: () => {
      void stopRequest();
    },
    handleSubmit,
    highlights,
    inputDisabled: inputDisabled(selectedWorkspaceId, pendingAction, capture.active),
    inputRef,
    inputValue,
    latestRun,
    rootRef,
    setInputValue,
    speechConfigured,
    statusTone,
    stopDisabled: pendingAction || !canStopRun(latestRun),
    viewState,
  };
}

function useEasyButtonSnapshot(
  selectedWorkspaceId: string | null,
  loadSnapshot: (workspaceId: string) => Promise<void>,
  resetStore: () => void,
) {
  useEffect(() => {
    if (!selectedWorkspaceId) {
      resetStore();
      return;
    }
    void loadSnapshot(selectedWorkspaceId);
  }, [loadSnapshot, resetStore, selectedWorkspaceId]);
}

function useEasyButtonPaneTitle(
  rootRef: RefObject<HTMLElement | null>,
  viewState: EasyButtonViewState,
  captureState: SpeechCaptureState,
) {
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
    if (!host) {
      return;
    }
    const title = paneTitleForState(viewState, captureState);
    setHostPaneChromeTitle(host, {
      fullTitle: title,
      title,
      truncation: "end",
    });
  }, [captureState, rootRef, viewState]);
}

function useEasyButtonCaptureCancellation(
  capture: EasyButtonSpeechCapture,
  latestRun: EasyRun | null,
): void {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !capture.active) {
        return;
      }
      event.preventDefault();
      capture.cancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [capture.active, capture.cancel]);

  useEffect(() => {
    if (captureIsSteering(capture.state) && !canStopRun(latestRun)) {
      capture.cancel();
    }
  }, [capture.cancel, capture.state, latestRun]);
}

// The pulse must restart on every fresh entry into the terminal state, so it is
// keyed on the working -> complete transition rather than on the state itself.
// The run id guard keeps a failed re-submit from re-pulsing the same run, and a
// restored terminal run never pulses because it is never preceded by `working`.
// It fires only for `completed`: a pulse is a confirmation, and confirming a run
// the user cancelled — or one that failed — would contradict the summary line,
// which withholds its check mark for exactly those two statuses.
function useEasyButtonConfirmPulse(
  viewState: EasyButtonViewState,
  statusTone: EasyButtonStatusTone,
  runId: string | null,
): boolean {
  const [confirmActive, setConfirmActive] = useState(false);
  const previousViewState = useRef<EasyButtonViewState | null>(null);
  const confirmedRunId = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousViewState.current;
    previousViewState.current = viewState;
    if (viewState !== "complete") {
      setConfirmActive(false);
      return;
    }
    if (statusTone !== "completed" || previous !== "working" || !runId) {
      return;
    }
    if (confirmedRunId.current === runId) {
      return;
    }
    confirmedRunId.current = runId;
    setConfirmActive(true);
  }, [runId, statusTone, viewState]);

  // The timer keys off `confirmActive` alone. Keyed off the run instead, a run
  // swap that stays terminal (switching workspaces) would tear the timer down
  // and strand the attribute at "true".
  useEffect(() => {
    if (!confirmActive) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmActive(false);
    }, confirmPulseDurationMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [confirmActive]);

  return confirmActive;
}

interface SubmitOptions {
  canSubmit: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  latestRun: EasyRun | null;
  selectedWorkspaceId: string | null;
  setInputValue: (value: string) => void;
  setPendingAction: (pending: boolean) => void;
  start: (workspaceId: string, requestText: string) => Promise<EasyRun>;
  steer: (workspaceId: string, text: string) => Promise<EasyRunSteerResult>;
  viewState: EasyButtonViewState;
}

function useEasyButtonSubmit({
  canSubmit,
  inputRef,
  inputValue,
  latestRun,
  selectedWorkspaceId,
  setInputValue,
  setPendingAction,
  start,
  steer,
  viewState,
}: SubmitOptions) {
  return useCallback(async () => {
    if (!selectedWorkspaceId || !canSubmit) {
      inputRef.current?.focus();
      return;
    }
    const requestText = inputValue.trim();
    setPendingAction(true);
    try {
      const steeringResult = await performEasyButtonSubmission({
        latestRun,
        requestText,
        selectedWorkspaceId,
        start,
        steer,
        viewState,
      });
      setInputValue("");
      if (steeringResult?.kind === "failure") {
        inputRef.current?.blur();
      }
    } catch {
      inputRef.current?.focus();
    } finally {
      setPendingAction(false);
    }
  }, [
    canSubmit,
    inputRef,
    inputValue,
    latestRun,
    selectedWorkspaceId,
    setInputValue,
    setPendingAction,
    start,
    steer,
    viewState,
  ]);
}

interface EasyButtonSubmission {
  latestRun: EasyRun | null;
  requestText: string;
  selectedWorkspaceId: string;
  start: (workspaceId: string, requestText: string) => Promise<EasyRun>;
  steer: (workspaceId: string, text: string) => Promise<EasyRunSteerResult>;
  viewState: EasyButtonViewState;
}

async function performEasyButtonSubmission({
  latestRun,
  requestText,
  selectedWorkspaceId,
  start,
  steer,
  viewState,
}: EasyButtonSubmission): Promise<EasyRunSteerResult | null> {
  if (viewState === "working" && canStopRun(latestRun)) {
    return steer(selectedWorkspaceId, requestText);
  }
  await start(selectedWorkspaceId, requestText);
  return null;
}

interface StopOptions {
  cancelCapture: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  latestRun: EasyRun | null;
  selectedWorkspaceId: string | null;
  setPendingAction: (pending: boolean) => void;
  stop: (workspaceId: string, easyRunId: string) => Promise<EasyRun>;
}

function useEasyButtonStop({
  cancelCapture,
  inputRef,
  latestRun,
  selectedWorkspaceId,
  setPendingAction,
  stop,
}: StopOptions) {
  return useCallback(async () => {
    if (!selectedWorkspaceId || !canStopRun(latestRun)) {
      return;
    }
    cancelCapture();
    setPendingAction(true);
    try {
      await stop(selectedWorkspaceId, latestRun.id);
    } catch {
      inputRef.current?.focus();
    } finally {
      setPendingAction(false);
    }
  }, [cancelCapture, inputRef, latestRun, selectedWorkspaceId, setPendingAction, stop]);
}

interface ControlClickOptions {
  capture: EasyButtonSpeechCapture;
  inputRef: RefObject<HTMLInputElement | null>;
  latestRun: EasyRun | null;
  pendingAction: boolean;
  selectedWorkspaceId: string | null;
  viewState: EasyButtonViewState;
}

function useEasyButtonControlClick({
  capture,
  inputRef,
  latestRun,
  pendingAction,
  selectedWorkspaceId,
  viewState,
}: ControlClickOptions) {
  return useCallback(
    () =>
      handleEasyButtonControlClick({
        capture,
        inputRef,
        latestRun,
        pendingAction,
        selectedWorkspaceId,
        viewState,
      }),
    [capture, inputRef, latestRun, pendingAction, selectedWorkspaceId, viewState],
  );
}

function handleEasyButtonControlClick(options: ControlClickOptions): void {
  if (!canUseSpeechCapture(options)) {
    focusEasyButtonInput(options.inputRef);
    return;
  }
  switch (speechCaptureControlAction(options.capture.state)) {
    case "commit":
      options.capture.commit();
      return;
    case "start":
      options.capture.start(speechCaptureIntent(options.viewState, options.latestRun));
      return;
    case "focus_input":
      focusEasyButtonInput(options.inputRef);
  }
}

function canUseSpeechCapture(options: ControlClickOptions): boolean {
  return (
    options.capture.availability.type === "configured" &&
    options.selectedWorkspaceId !== null &&
    !options.pendingAction
  );
}

function speechCaptureControlAction(state: SpeechCaptureState): "commit" | "focus_input" | "start" {
  switch (state.type) {
    case "listening":
      return "commit";
    case "idle":
    case "failed":
      return "start";
    case "requesting_permission":
    case "connecting":
    case "committing":
      return "focus_input";
  }
}

function speechCaptureIntent(
  viewState: EasyButtonViewState,
  latestRun: EasyRun | null,
): "start" | "steer" {
  return viewState === "working" && canStopRun(latestRun) ? "steer" : "start";
}

function focusEasyButtonInput(inputRef: RefObject<HTMLInputElement | null>): void {
  inputRef.current?.focus();
}

interface CaptionSlotProps {
  capture: SpeechCaptureState;
  error: string | null;
  latestRun: EasyRun | null;
  speechAvailability: SpeechCaptureAvailability;
  speechConfigured: boolean;
  viewState: EasyButtonViewState;
}

function CaptionSlot({
  capture,
  error,
  latestRun,
  speechAvailability,
  speechConfigured,
  viewState,
}: CaptionSlotProps) {
  return (
    <div className="easy-button-caption-slot">
      <SpeechCaptureLine state={capture} />
      <CurrentFocus latestRun={latestRun} viewState={viewState} />
      <p
        aria-live="polite"
        className="easy-button-helper"
        data-testid="easy-button-helper"
        role="status"
      >
        {speechConfigured
          ? speechCaptureHelperCopy(capture, viewState === "working")
          : helperCopyForState(viewState)}
      </p>
      <SpeechCaptureError state={capture} />
      <SpeechAvailabilityStatus availability={speechAvailability} />
      <SummaryText latestRun={latestRun} viewState={viewState} />
      <NarratorStatus latestRun={latestRun} />
      <ErrorText error={error} />
    </div>
  );
}

function CurrentFocus({ latestRun, viewState }: Pick<CaptionSlotProps, "latestRun" | "viewState">) {
  const status = currentFocusStatus(latestRun, viewState);
  return (
    <div aria-live="polite" className="easy-button-focus-block">
      <p className="easy-button-focus-label" data-testid="easy-button-focus-label">
        {currentFocusLabel(status)}
      </p>
      <p className="easy-button-current-focus" data-testid="easy-button-current-focus">
        {status === "none" ? "" : latestRun?.currentFocus.text}
      </p>
    </div>
  );
}

function AgentChip({
  activeAgentCount,
  viewState,
}: {
  activeAgentCount: number;
  viewState: EasyButtonViewState;
}) {
  return (
    <span className="easy-button-agent-chip" data-testid="easy-button-agent-chip">
      {viewState === "working" ? agentLabel(activeAgentCount) : ""}
    </span>
  );
}

function SummaryText({ latestRun, viewState }: Pick<CaptionSlotProps, "latestRun" | "viewState">) {
  if (viewState !== "complete" || !latestRun?.summary) {
    return null;
  }
  return (
    <p className="easy-button-summary" data-testid="easy-button-summary">
      {latestRun.status === "completed" ? (
        <>
          <span aria-hidden="true" className="easy-button-summary-ok">
            ✓
          </span>{" "}
        </>
      ) : null}
      {latestRun.summary}
    </p>
  );
}

function ErrorText({ error }: Pick<CaptionSlotProps, "error">) {
  if (!error) {
    return null;
  }
  return (
    <p className="easy-button-error" data-testid="easy-button-error">
      {error}
    </p>
  );
}

function NarratorStatus({ latestRun }: Pick<CaptionSlotProps, "latestRun">) {
  if (latestRun?.narratorStatus !== "degraded") {
    return null;
  }
  return (
    <p className="easy-button-narrator-status">
      Narration degraded — current focus may be outdated.
    </p>
  );
}

function StopButton({
  disabled,
  onClick,
  viewState,
}: {
  disabled: boolean;
  onClick: () => void;
  viewState: EasyButtonViewState;
}) {
  if (viewState !== "working") {
    return null;
  }
  return (
    <button
      aria-label="Stop easy run"
      className="easy-button-stop-button"
      data-testid="easy-button-stop-button"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Square aria-hidden="true" className="easy-button-stop-button-icon" />
      Stop
    </button>
  );
}

// The swirl is the pane's working-state indicator, and it is driven entirely by
// `data-easy-button-state` on the surface — nothing here reads the controller.
function SwirlField() {
  return (
    <div aria-hidden="true" className="easy-button-swirl">
      <div className="easy-button-swirl-inner">
        <div className="easy-button-swirl-core" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-1" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-2" />
        <div className="easy-button-swirl-layer easy-button-swirl-layer-3" />
      </div>
    </div>
  );
}

function ControlGlyph({
  speechConfigured,
  statusTone,
  viewState,
}: {
  speechConfigured: boolean;
  statusTone: EasyButtonStatusTone;
  viewState: EasyButtonViewState;
}) {
  if (speechConfigured) {
    return <SpeechControlGlyph />;
  }
  switch (viewState) {
    case "complete":
      return statusTone === "failed" ? (
        <X aria-hidden="true" className="easy-button-glyph" />
      ) : (
        <Check aria-hidden="true" className="easy-button-glyph" />
      );
    // The button keeps its resting glyph while working; the swirl behind it, not
    // a glyph swap, is what says the run is live.
    case "working":
    case "idle":
      return <Sparkles aria-hidden="true" className="easy-button-glyph" />;
  }
}

function useSelectedWorkspaceId(): string | null {
  const session = useWorkspaceStore((state) => state.session);
  return session?.selectedWorkspaceId || null;
}

function activeAgentCountForState(viewState: EasyButtonViewState, latestRun: EasyRun | null) {
  if (viewState !== "working") {
    return 0;
  }
  return Math.max(latestRun?.activeAgentCount ?? 1, 1);
}

function canSubmitRequest(
  selectedWorkspaceId: string | null,
  inputValue: string,
  latestRun: EasyRun | null,
  viewState: EasyButtonViewState,
) {
  if (!selectedWorkspaceId || !inputValue.trim()) {
    return false;
  }
  return viewState !== "working" || canStopRun(latestRun);
}

function canStopRun(latestRun: EasyRun | null): latestRun is EasyRun {
  return latestRun?.status === "working";
}

function controlDisabled(
  selectedWorkspaceId: string | null,
  pendingAction: boolean,
  capture: EasyButtonSpeechCapture,
) {
  if (!selectedWorkspaceId || pendingAction) {
    return true;
  }
  if (capture.availability.type !== "configured") {
    return false;
  }
  return (
    capture.state.type === "requesting_permission" ||
    capture.state.type === "connecting" ||
    capture.state.type === "committing"
  );
}

function inputDisabled(
  selectedWorkspaceId: string | null,
  pendingAction: boolean,
  captureActive: boolean,
) {
  return !selectedWorkspaceId || pendingAction || captureActive;
}

function agentLabel(activeAgentCount: number) {
  if (activeAgentCount === 1) {
    return "1 agent";
  }
  return `${activeAgentCount} agents`;
}

function easyButtonViewState(
  latestRun: EasyRun | null,
  pendingAction: boolean,
): EasyButtonViewState {
  if (latestRun?.status === "working" || pendingAction) {
    return "working";
  }
  if (
    latestRun &&
    (latestRun.status === "completed" ||
      latestRun.status === "failed" ||
      latestRun.status === "stopped")
  ) {
    return "complete";
  }
  return "idle";
}

function statusToneForState(
  viewState: EasyButtonViewState,
  latestRun: EasyRun | null,
): EasyButtonStatusTone {
  if (viewState !== "complete" || !latestRun) {
    return "none";
  }
  switch (latestRun.status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return "stopped";
    case "working":
      return "none";
  }
}

function currentFocusStatus(
  latestRun: EasyRun | null,
  viewState: EasyButtonViewState,
): EasyRunFocusStatus | "none" {
  // A new start enters the pending working layout before its Easy Run replaces
  // the prior terminal snapshot. That prior run is not the active objective.
  if (
    !latestRun ||
    viewState === "idle" ||
    (viewState === "working" && latestRun.status !== "working")
  ) {
    return "none";
  }
  return latestRun.currentFocus.status;
}

function currentFocusLabel(status: EasyRunFocusStatus | "none"): string {
  switch (status) {
    case "updating":
      return "Updating focus…";
    case "current":
    case "stale":
      return "Current focus";
    case "none":
      return "";
  }
}

function controlAriaLabel(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Focus Easy Button steering input";
    case "complete":
      return "Focus Easy Button request input";
    case "idle":
      return "Focus Easy Button request input";
  }
}

function helperCopyForState(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Working — Stop to cancel";
    case "complete":
      return "Type a request to start again";
    case "idle":
      return "Type a request to begin";
  }
}

function paneTitleForState(
  viewState: EasyButtonViewState,
  captureState: SpeechCaptureState,
): string {
  const captureTitle = paneTitleForCaptureState(captureState);
  if (captureTitle) {
    return captureTitle;
  }
  return paneTitleForRunState(viewState);
}

function paneTitleForCaptureState(captureState: SpeechCaptureState): string | null {
  switch (captureState.type) {
    case "requesting_permission":
      return "Easy Button · microphone permission";
    case "connecting":
      return "Easy Button · connecting";
    case "listening":
      return "Easy Button · listening";
    case "committing":
      return "Easy Button · committing";
    case "failed":
      return "Easy Button · voice failed";
    case "idle":
      return null;
  }
}

function paneTitleForRunState(viewState: EasyButtonViewState): string {
  switch (viewState) {
    case "working":
      return "Easy Button · working";
    case "complete":
      return "Easy Button · complete";
    case "idle":
      return "Easy Button";
  }
}

function captureIsSteering(state: SpeechCaptureState): boolean {
  switch (state.type) {
    case "requesting_permission":
    case "connecting":
    case "listening":
    case "committing":
      return state.intent === "steer";
    case "idle":
    case "failed":
      return false;
  }
}
