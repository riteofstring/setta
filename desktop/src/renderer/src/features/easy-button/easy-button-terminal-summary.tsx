import { RotateCcw } from "lucide-react";

import type { EasyRun } from "@generated/backend";

import type { SpeechPlaybackState, SpeechSummarySource } from "./speech-playback-controller";
import type { EasyButtonSpeechPlayback } from "./use-speech-playback";

type SummaryPlaybackType = SpeechPlaybackState["type"];

interface EasyButtonTerminalSummaryProps {
  latestRun: EasyRun | null;
  outputConfigured: boolean;
  playback: Pick<EasyButtonSpeechPlayback, "replaySummary" | "state">;
  terminal: boolean;
  workspaceId: string | null;
}

export function EasyButtonTerminalSummary({
  latestRun,
  outputConfigured,
  playback,
  terminal,
  workspaceId,
}: EasyButtonTerminalSummaryProps) {
  if (!terminal || !latestRun?.summary) {
    return null;
  }
  const source = workspaceId ? { easyRunId: latestRun.id, workspaceId } : null;
  const playbackType = terminalSummaryPlaybackType(playback.state, source);
  const replayDisabled = playbackType === "speaking" || playbackType === "synthesizing";

  return (
    <p
      className="easy-button-summary"
      data-easy-button-summary-playback={playbackType}
      data-easy-button-summary-source={latestRun.id}
      data-testid="easy-button-summary"
    >
      <span aria-hidden="true" className="easy-button-summary-equalizer">
        <i />
        <i />
        <i />
      </span>
      {latestRun.status === "completed" ? (
        <>
          <span aria-hidden="true" className="easy-button-summary-ok">
            ✓
          </span>{" "}
        </>
      ) : null}
      <span data-testid="easy-button-summary-text">{latestRun.summary}</span>
      {outputConfigured && source ? (
        <button
          aria-label="Replay the spoken summary"
          className="easy-button-summary-replay"
          data-testid="easy-button-summary-replay"
          disabled={replayDisabled}
          onClick={() => playback.replaySummary(source)}
          type="button"
        >
          <RotateCcw aria-hidden="true" />
          Replay
        </button>
      ) : null}
    </p>
  );
}

export function terminalSummaryPlaybackType(
  state: SpeechPlaybackState,
  source: SpeechSummarySource | null,
): SummaryPlaybackType {
  if (
    state.type === "idle" ||
    !source ||
    state.source.easyRunId !== source.easyRunId ||
    state.source.workspaceId !== source.workspaceId
  ) {
    return "idle";
  }
  return state.type;
}
