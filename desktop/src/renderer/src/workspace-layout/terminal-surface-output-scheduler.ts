import { type ScheduledTerminalOutput, TerminalOutputScheduler } from "./terminal-output-scheduler";

type PendingTerminalOutput = Omit<ScheduledTerminalOutput, "outputSchedule">;

export function createTerminalSurfaceOutputScheduler(
  write: (outputs: ScheduledTerminalOutput[], onComplete?: () => void) => void,
): TerminalOutputScheduler<PendingTerminalOutput> {
  return new TerminalOutputScheduler<PendingTerminalOutput>({
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    requestMicrotask: (callback) => queueMicrotask(callback),
    write: (outputs, onComplete) =>
      write(
        outputs.map(({ item, outputSchedule }) => ({ ...item, outputSchedule })),
        onComplete,
      ),
  });
}
