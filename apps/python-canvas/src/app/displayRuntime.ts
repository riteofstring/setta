import { runGeneratedProgram } from "../api/client";
import type { ProjectSnapshotV2 } from "../api/generatedContract";
import { readDisplayOutput, type DisplayPanel } from "./displayOutput";

export type DisplayState = {
  busy: boolean;
  currentRevision: number;
  panels: Record<string, { panel: DisplayPanel; revision: number }>;
  error: string | null;
  warnings: string[];
  log: string;
};

export const initialDisplayState: DisplayState = {
  busy: false,
  currentRevision: 0,
  panels: {},
  error: null,
  warnings: [],
  log: "",
};

export function createDisplayRuntime({
  runAfterEditsFlush,
  updateState,
}: {
  runAfterEditsFlush: (
    operation: (snapshot: ProjectSnapshotV2) => Promise<void>,
  ) => Promise<void>;
  updateState: (state: DisplayState) => void;
}) {
  let state = initialDisplayState;
  let disposed = false;
  let abort: AbortController | null = null;
  const update = (changes: Partial<DisplayState>) => {
    if (disposed) return;
    state = { ...state, ...changes };
    updateState(state);
  };
  const run = () => {
    if (disposed || state.busy) return;
    update({ busy: true, error: null, warnings: [] });
    void runAfterEditsFlush(async (snapshot) => {
      if (disposed) return;
      try {
        abort = new AbortController();
        const result = await runGeneratedProgram(
          {
            projectId: snapshot.project.id,
            expectedRevision: snapshot.project.revision,
            runTimeoutMilliseconds: 30000,
          },
          abort.signal,
        );
        update({
          log: [result.stdout, result.stderr].filter(Boolean).join("\n"),
        });
        if (result.terminationReason !== "exited" || result.exitCode !== 0) {
          const reason =
            result.terminationReason === "timed_out"
              ? "This run took too long. Try a smaller experiment."
              : result.terminationReason === "output_limit"
                ? "This run produced too much output. Try fewer samples or layers."
                : "This run needs a tweak. Check the details below, adjust the inputs, then run again.";
          throw new Error(reason);
        }
        const display = readDisplayOutput(result.stdout);
        const panels = { ...state.panels };
        for (const panel of display.panels)
          panels[panel.id] = { panel, revision: result.revision };
        update({
          panels,
          warnings: display.warnings,
          log: [display.log, result.stderr].filter(Boolean).join("\n"),
        });
      } catch (error: unknown) {
        update({
          error:
            error instanceof Error
              ? error.message
              : "Unable to run the experiment. Try again.",
        });
      }
    })
      .catch((error: unknown) => {
        update({
          error:
            error instanceof Error
              ? error.message
              : "Unable to run the experiment. Try again.",
        });
      })
      .finally(() => {
        abort = null;
        update({ busy: false });
      });
  };
  return {
    run,
    setRevision: (currentRevision: number) => {
      if (state.currentRevision !== currentRevision)
        update({ currentRevision });
    },
    dispose: () => {
      disposed = true;
      abort?.abort();
    },
  };
}
