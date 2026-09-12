import { setPythonTarget } from "../backend/client";
import type { ProjectSnapshotV2 } from "../backend/generatedContract";
import {
  changedCanonicalParameterCallableIds,
  sameCanonicalPythonTarget,
} from "./pythonCanvasAppSupport";
import type { PythonCanvasMutationEnvironment } from "./pythonCanvasMutations";
import {
  readEditablePythonTarget,
  requireCurrentSnapshot,
} from "./pythonCanvasMutationSupport";

const mutationDebounceMs = 300;

export function createPythonTargetMutations(
  environment: PythonCanvasMutationEnvironment,
) {
  let targetTimer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (targetTimer !== null) {
      clearTimeout(targetTimer);
      targetTimer = null;
    }
  }

  function schedule() {
    cancel();
    targetTimer = setTimeout(() => {
      targetTimer = null;
      void environment.enqueue(async () => {
        await persist();
      });
    }, mutationDebounceMs);
  }

  async function persist(): Promise<boolean> {
    const current = requireCurrentSnapshot(environment);
    if (current === null) {
      return false;
    }
    const authored = readEditablePythonTarget(environment);
    if (authored === null || sameCanonicalPythonTarget(authored, current)) {
      return true;
    }
    if (authored.generated !== current.generatedCode.body) {
      environment.restoreCanonicalProject();
      environment.updateAnnouncement({
        kind: "error",
        message: "The generated Python body cannot be edited.",
      });
      return false;
    }
    environment.updateAnnouncement({
      description: "Checking the Python target with Basedpyright.",
      kind: "pending",
    });
    try {
      const next = await setPythonTarget({
        expectedRevision: current.project.revision,
        prefix: authored.prefix,
        projectId: current.project.id,
        suffix: authored.suffix,
      });
      if (!environment.isActive()) {
        return false;
      }
      environment.publishSnapshot(next);
      environment.acceptCanonicalSnapshot(next, {
        kind: "python-target",
        refreshedCallableIds: changedCanonicalParameterCallableIds(
          current,
          next,
        ),
      });
      environment.updateAnnouncement({ kind: "idle" });
      return true;
    } catch (error) {
      if (environment.isActive()) {
        await environment.handleMutationFailure("the Python target", error, {
          reportFailure: environment.updateAnnouncement,
          restore: environment.restoreCanonicalProject,
        });
      }
      return false;
    }
  }

  function runAfterFlush(
    operation: (snapshot: ProjectSnapshotV2) => Promise<void>,
  ): Promise<void> {
    cancel();
    return environment.enqueue(async () => {
      if (!(await persist())) {
        return;
      }

      const snapshot = requireCurrentSnapshot(environment);
      if (snapshot !== null) {
        await operation(snapshot);
      }
    });
  }

  return { cancel, runAfterFlush, schedule };
}
