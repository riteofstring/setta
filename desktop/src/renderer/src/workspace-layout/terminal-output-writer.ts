import type { Terminal as XtermTerminal } from "@xterm/xterm";

import { recordTerminalOutputStage } from "./terminal-latency-recorder";
import type { ScheduledTerminalOutput } from "./terminal-output-scheduler";
import { terminalSurfaceLimits } from "./terminal-surface-state";

export function writeTerminalOutputBatch(
  terminal: XtermTerminal | null,
  outputs: ScheduledTerminalOutput[],
  onComplete?: () => void,
): number | null {
  if (!terminal || outputs.length === 0) {
    onComplete?.();
    return null;
  }
  const followOutput = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY;
  terminal.write(joinTerminalOutputBytes(outputs), () => {
    recordOutputStage(outputs, "terminal_output_xterm_write");
    if (followOutput) {
      terminal.scrollToBottom();
    }
    onComplete?.();
    window.requestAnimationFrame(() => {
      recordOutputStage(outputs, "terminal_output_painted");
    });
  });
  return outputs.reduce(
    (maximum, output) =>
      Math.max(
        maximum,
        Math.max(1, Math.min(terminalSurfaceLimits.defaultRows, output.event.payload.byteCount)),
      ),
    0,
  );
}

function joinTerminalOutputBytes(outputs: ScheduledTerminalOutput[]): Uint8Array {
  const byteCount = outputs.reduce((total, output) => total + output.bytes.length, 0);
  const joined = new Uint8Array(byteCount);
  let offset = 0;
  for (const output of outputs) {
    joined.set(output.bytes, offset);
    offset += output.bytes.length;
  }
  return joined;
}

function recordOutputStage(
  outputs: ScheduledTerminalOutput[],
  stage: "terminal_output_xterm_write" | "terminal_output_painted",
): void {
  for (const output of outputs) {
    recordTerminalOutputStage(stage, output.event, output.outputSchedule);
  }
}
