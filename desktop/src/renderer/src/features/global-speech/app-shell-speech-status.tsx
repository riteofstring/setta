import { CircleAlert, LoaderCircle, Mic, RotateCcw, Square, Volume2, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useConversationStore } from "../../stores/conversation-store";
import {
  type AppShellSpeechCaptureContextValue,
  useAppShellSpeechCapture,
} from "./app-shell-speech-capture";
import type { AppShellSpeechCaptureController } from "./app-shell-speech-capture-controller";
import {
  type AppShellSpeechPlaybackContextValue,
  useAppShellSpeechPlayback,
} from "./app-shell-speech-playback";
import type {
  AppShellSpeechPlaybackController,
  SpeechPlaybackSnapshot,
} from "./app-shell-speech-playback-controller";
import {
  globalSpeechCapturePresentation,
  type GlobalSpeechCapturePresentation,
  type GlobalSpeechPresentationSource,
  paneSpeechPresentation,
  type PaneSpeechPresentation,
  shellSpeechCaptureAction,
  shellSpeechCaptureControlLabel,
  shellSpeechCaptureLabel,
  shellSpeechPlaybackLabel,
  shellSpeechStatusLabel,
  speechCaptureTranscriptPreview,
  speechPresentationConversationId,
} from "./global-speech-presentation";
import { masterSpeechCaptureRequest } from "./speech-capture-destination";

export function AppShellSpeechStatus() {
  const model = useShellSpeechStatusModel();
  return model ? <ShellSpeechStatusView model={model} /> : null;
}

interface ShellSpeechStatusModel {
  action: ReturnType<typeof shellSpeechCaptureAction>;
  capture: GlobalSpeechCapturePresentation;
  captureControlLabel: string;
  captureController: AppShellSpeechCaptureController;
  captureLabel: string;
  playbackController: AppShellSpeechPlaybackController;
  playbackLabel: string | null;
  playbackSnapshot: SpeechPlaybackSnapshot;
  sourceConversationId: string | null;
}

function useShellSpeechStatusModel(): ShellSpeechStatusModel | null {
  const captureContext = useAppShellSpeechCapture();
  const playbackContext = useAppShellSpeechPlayback();
  const capture = captureFromContext(captureContext);
  const sourceConversationId = speechSourceConversationId(capture, playbackContext);
  const sourceConversationTitle = useConversationStore((state) =>
    conversationTitle(state.conversations, sourceConversationId),
  );
  if (!captureContext) {
    return null;
  }
  if (!playbackContext) {
    return null;
  }
  if (!capture) {
    return null;
  }
  return {
    action: shellSpeechCaptureAction(capture),
    capture,
    captureControlLabel: shellSpeechCaptureControlLabel(capture, sourceConversationTitle),
    captureController: captureContext.controller,
    captureLabel: shellSpeechCaptureLabel(capture, sourceConversationTitle),
    playbackController: playbackContext.controller,
    playbackLabel: shellSpeechPlaybackLabel(playbackContext.snapshot, sourceConversationTitle),
    playbackSnapshot: playbackContext.snapshot,
    sourceConversationId,
  };
}

function captureFromContext(context: AppShellSpeechCaptureContextValue | null) {
  return context ? globalSpeechCapturePresentation(context.snapshot) : null;
}

function speechSourceConversationId(
  capture: GlobalSpeechCapturePresentation | null,
  playback: AppShellSpeechPlaybackContextValue | null,
) {
  if (!capture) {
    return null;
  }
  if (!playback) {
    return null;
  }
  return speechPresentationConversationId(capture, playback.snapshot);
}

function conversationTitle(
  conversations: ReturnType<typeof useConversationStore.getState>["conversations"],
  conversationId: string | null,
) {
  if (!conversationId) {
    return null;
  }
  const snapshot = conversations.get(conversationId)?.snapshot;
  return snapshot ? snapshot.conversation.title : null;
}

function ShellSpeechStatusView({ model }: { model: ShellSpeechStatusModel }) {
  return (
    <div
      aria-label="Global voice status"
      className="setta-shell-speech-status app-no-drag"
      data-speech-capture={model.capture.state}
      data-speech-playback={model.playbackSnapshot.state.type}
      data-speech-source-conversation={model.sourceConversationId ?? undefined}
      data-testid="shell-speech-status"
    >
      <button
        aria-label={model.captureControlLabel}
        className="setta-shell-speech-button"
        data-testid="shell-speech-capture-control"
        disabled={model.action === null}
        onClick={() => executeShellCaptureAction(model.captureController, model.action)}
        title={model.captureControlLabel}
        type="button"
      >
        <ShellCaptureGlyph capture={model.capture} />
      </button>
      <ShellSpeechStatusText
        capture={model.capture}
        captureLabel={model.captureLabel}
        label={model.playbackLabel}
      />
      <PlaybackStopButton controller={model.playbackController} snapshot={model.playbackSnapshot} />
      <FailedCaptureDiscardButton capture={model.capture} controller={model.captureController} />
    </div>
  );
}

export function usePaneSpeechPresentation(
  conversationId: string | null,
  paneId: string | null,
  source?: GlobalSpeechPresentationSource,
): PaneSpeechPresentation | null {
  const captureContext = useAppShellSpeechCapture();
  const playbackContext = useAppShellSpeechPlayback();
  const captureSource = resolveCaptureSource(source, captureContext);
  const playbackSource = resolvePlaybackSource(source, playbackContext);
  const captureSnapshot = useSyncExternalStore(
    captureSource.subscribe,
    captureSource.getSnapshot,
    captureSource.getSnapshot,
  );
  const playbackSnapshot = useSyncExternalStore(
    playbackSource.subscribe,
    playbackSource.getSnapshot,
    playbackSource.getSnapshot,
  );
  const capture = captureSnapshotPresentation(captureSnapshot);
  const sourceConversationId = presentedSpeechConversationId(capture, playbackSnapshot);
  const sourceConversationTitle = useConversationStore((state) =>
    conversationTitle(state.conversations, sourceConversationId),
  );
  if (!capture) {
    return null;
  }
  return paneSpeechPresentation(
    capture,
    playbackSnapshot,
    { conversationId, paneId },
    sourceConversationTitle,
  );
}

function subscribeUnavailableSpeech(): () => void {
  return () => {};
}

function unavailableCaptureSnapshot(): null {
  return null;
}

const unavailablePlaybackSnapshotValue = { queued: [], state: { type: "idle" } } as const;

function unavailablePlaybackSnapshot() {
  return unavailablePlaybackSnapshotValue;
}

const unavailableCaptureSource = {
  getSnapshot: unavailableCaptureSnapshot,
  subscribe: subscribeUnavailableSpeech,
};

const unavailablePlaybackSource = {
  getSnapshot: unavailablePlaybackSnapshot,
  subscribe: subscribeUnavailableSpeech,
};

function resolveCaptureSource(
  source: GlobalSpeechPresentationSource | undefined,
  context: AppShellSpeechCaptureContextValue | null,
) {
  if (source) {
    return source.capture;
  }
  return context ? context.controller : unavailableCaptureSource;
}

function resolvePlaybackSource(
  source: GlobalSpeechPresentationSource | undefined,
  context: AppShellSpeechPlaybackContextValue | null,
) {
  if (source) {
    return source.playback;
  }
  return context ? context.controller : unavailablePlaybackSource;
}

function captureSnapshotPresentation(
  snapshot: ReturnType<AppShellSpeechCaptureController["getSnapshot"]> | null,
) {
  return snapshot ? globalSpeechCapturePresentation(snapshot) : null;
}

function presentedSpeechConversationId(
  capture: GlobalSpeechCapturePresentation | null,
  playback: SpeechPlaybackSnapshot,
) {
  return capture ? speechPresentationConversationId(capture, playback) : null;
}

export function PaneSpeechActivityIndicator({
  presentation,
}: {
  presentation: PaneSpeechPresentation | null | undefined;
}) {
  if (!presentation?.activityLabel || !presentation.activityKind) {
    return null;
  }
  const label = speechActivityAccessibleLabel(presentation);
  return (
    <span
      aria-label={label}
      className="easy-button-speech-activity"
      data-speech-activity={presentation.activityKind}
      data-testid="easy-button-speech-activity"
      title={label}
    >
      <PaneSpeechActivityGlyph kind={presentation.activityKind} />
      <span className="easy-button-speech-activity-label">{presentation.activityLabel}</span>
      {presentation.transcriptPreview ? (
        <span className="easy-button-speech-transcript" data-testid="easy-button-speech-transcript">
          “{presentation.transcriptPreview}”
        </span>
      ) : null}
    </span>
  );
}

function speechActivityAccessibleLabel(presentation: PaneSpeechPresentation): string {
  return presentation.transcriptPreview
    ? `${presentation.activityLabel}: ${presentation.transcriptPreview}`
    : (presentation.activityLabel ?? "");
}

function PlaybackStopButton({
  controller,
  snapshot,
}: {
  controller: AppShellSpeechPlaybackController;
  snapshot: SpeechPlaybackSnapshot;
}) {
  if (!activePlaybackStates.has(snapshot.state.type)) {
    return null;
  }
  return (
    <button
      aria-label="Stop speaking"
      className="setta-shell-speech-stop"
      data-testid="shell-speech-stop"
      onClick={controller.stop}
      title="Stop speaking"
      type="button"
    >
      <X aria-hidden="true" />
    </button>
  );
}

const activePlaybackStates = new Set<SpeechPlaybackSnapshot["state"]["type"]>([
  "speaking",
  "synthesizing",
]);

function FailedCaptureDiscardButton({
  capture,
  controller,
}: {
  capture: GlobalSpeechCapturePresentation;
  controller: AppShellSpeechCaptureController;
}) {
  if (capture.state !== "failed") {
    return null;
  }
  if (capture.retry === null) {
    return null;
  }
  return (
    <button
      aria-label="Discard the failed voice request"
      className="setta-shell-speech-stop"
      data-testid="shell-speech-discard"
      onClick={() => discardFailedCapture(controller, capture)}
      title="Discard the failed voice request"
      type="button"
    >
      <X aria-hidden="true" />
    </button>
  );
}

function executeShellCaptureAction(
  controller: AppShellSpeechCaptureController,
  action: ReturnType<typeof shellSpeechCaptureAction>,
): void {
  if (action !== null) {
    shellCaptureActionExecutors[action](controller);
  }
}

const shellCaptureActionExecutors = {
  cancel: (controller) => controller.cancel(),
  commit: (controller) => controller.commit(),
  retry_conversation: (controller) => controller.retryConversationSubmission(),
  retry_master: (controller) => controller.retryMasterSubmission(),
  start: startShellCapture,
} satisfies Record<
  NonNullable<ReturnType<typeof shellSpeechCaptureAction>>,
  (controller: AppShellSpeechCaptureController) => void
>;

function startShellCapture(controller: AppShellSpeechCaptureController): void {
  void controller.start(masterSpeechCaptureRequest());
}

function discardFailedCapture(
  controller: AppShellSpeechCaptureController,
  capture: Extract<GlobalSpeechCapturePresentation, { state: "failed" }>,
): void {
  switch (capture.retry) {
    case "conversation":
      controller.discardCompletedConversationTranscript();
      return;
    case "master":
      controller.discardCompletedTranscript();
      return;
    case null:
      return;
    default:
      return assertNever(capture.retry);
  }
}

function ShellCaptureGlyph({ capture }: { capture: GlobalSpeechCapturePresentation }) {
  const kind = shellCaptureGlyphKind(capture);
  switch (kind) {
    case "loading":
      return <LoaderCircle aria-hidden="true" className="setta-shell-speech-spinner" />;
    case "stop":
      return <Square aria-hidden="true" />;
    case "failed":
      return <CircleAlert aria-hidden="true" />;
    case "retry":
      return <RotateCcw aria-hidden="true" />;
    case "microphone":
      return <Mic aria-hidden="true" />;
    default:
      return assertNever(kind);
  }
}

type ShellCaptureGlyphKind = "failed" | "loading" | "microphone" | "retry" | "stop";

function shellCaptureGlyphKind(capture: GlobalSpeechCapturePresentation): ShellCaptureGlyphKind {
  if (capture.state === "failed") {
    return capture.retry === null ? "failed" : "retry";
  }
  return shellCaptureGlyphKinds[capture.state];
}

const shellCaptureGlyphKinds = {
  committing: "loading",
  connecting: "loading",
  idle: "microphone",
  listening: "stop",
  requesting_permission: "loading",
  submitting: "loading",
  unavailable: "microphone",
} as const satisfies Record<
  Exclude<GlobalSpeechCapturePresentation["state"], "failed">,
  ShellCaptureGlyphKind
>;

function ShellSpeechStatusText({
  capture,
  captureLabel,
  label,
}: {
  capture: GlobalSpeechCapturePresentation;
  captureLabel: string;
  label: string | null;
}) {
  const visibleLabel = shellSpeechStatusLabel(capture, captureLabel, label);
  const transcriptPreview = speechCaptureTranscriptPreview(capture);
  return visibleLabel ? (
    <span className="setta-shell-speech-label" data-testid="shell-speech-label" role="status">
      <span className="setta-shell-speech-state-label">{visibleLabel}</span>
      {transcriptPreview ? (
        <span className="setta-shell-speech-transcript" data-testid="shell-speech-transcript">
          “{transcriptPreview}”
        </span>
      ) : null}
    </span>
  ) : null;
}

function PaneSpeechActivityGlyph({ kind }: { kind: PaneSpeechPresentation["activityKind"] }) {
  switch (kind) {
    case "capture":
      return <Mic aria-hidden="true" />;
    case "speaking":
      return <Volume2 aria-hidden="true" />;
    case "synthesizing":
    case "queued":
      return <LoaderCircle aria-hidden="true" />;
    case "failed":
      return <CircleAlert aria-hidden="true" />;
    case null:
      return null;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported global speech status value: ${JSON.stringify(value)}`);
}
