import type {
  BrowserPipelineStage,
  BrowserStageProgress,
  BrowserStageStatus,
} from "./types";

export function validateBrowserPipeline<Input>(
  stages: readonly BrowserPipelineStage<Input>[],
): void {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  if (
    stages.length === 0 ||
    byId.size !== stages.length ||
    stages.some((stage) => !stage.id)
  ) {
    throw new Error("A browser pipeline needs nonempty, unique stage IDs.");
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string): void {
    const stage = byId.get(id);
    if (!stage) throw new Error(`Unknown browser pipeline dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`Browser pipeline cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of stage.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const stage of stages) visit(stage.id);
}

export async function executeBrowserPipeline<Input>(
  stages: readonly BrowserPipelineStage<Input>[],
  input: Input,
  signal: AbortSignal,
  onStage: (id: string, status: BrowserStageStatus) => void = () => {},
  onProgress: (id: string, progress: BrowserStageProgress) => void = () => {},
): Promise<Record<string, unknown>> {
  validateBrowserPipeline(stages);
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const pending = new Map<string, Promise<unknown>>();
  function execute(id: string): Promise<unknown> {
    const existing = pending.get(id);
    if (existing) return existing;
    const stage = byId.get(id)!;
    const task = Promise.all(
      (stage.dependencies ?? []).map(
        async (dependency) => [dependency, await execute(dependency)] as const,
      ),
    ).then(async (entries) => {
      signal.throwIfAborted();
      onStage(id, "running");
      let running = true;
      try {
        const result = await stage.run({
          input,
          dependencies: Object.fromEntries(entries),
          signal,
          reportProgress: (progress) => {
            if (!running || signal.aborted) return;
            if (
              progress.fraction !== undefined &&
              (!Number.isFinite(progress.fraction) ||
                progress.fraction < 0 ||
                progress.fraction > 1)
            )
              throw new RangeError(
                "Stage progress must be between zero and one.",
              );
            onProgress(id, { ...progress });
          },
        });
        signal.throwIfAborted();
        onStage(id, "ready");
        return result;
      } catch (error) {
        onStage(id, "error");
        throw error;
      } finally {
        running = false;
      }
    });
    pending.set(id, task);
    return task;
  }
  return Object.fromEntries(
    await Promise.all(
      stages.map(async (stage) => [stage.id, await execute(stage.id)]),
    ),
  );
}
