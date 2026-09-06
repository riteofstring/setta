import type { WorkspaceSection } from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import { runtimeValueKey, type RuntimeViewState } from "../app/runtimeState";
import type {
  Binding,
  InvocationStatus,
  RuntimeUpdate,
} from "../backend/generatedContract";
import { readStatusSectionData } from "./sectionData";

const ACTIVE_INVOCATION_STATES = new Set(["queued", "running", "streaming"]);

function targetBindingIds(bindings: Binding[], sectionId: string): string[] {
  return bindings
    .filter((binding) =>
      Object.values(binding.outputs).some(
        (target) => target.sectionId === sectionId,
      ),
    )
    .map((binding) => binding.id);
}

function activeInvocation(
  bindingIds: string[],
  runtime: RuntimeViewState,
): InvocationStatus | undefined {
  return bindingIds
    .map((bindingId) => runtime.invocations[bindingId])
    .find(
      (invocation) =>
        invocation !== undefined &&
        ACTIVE_INVOCATION_STATES.has(invocation.state),
    );
}

function latestUpdate(
  bindingIds: string[],
  runtime: RuntimeViewState,
): RuntimeUpdate | undefined {
  let latest: RuntimeUpdate | undefined;
  for (const bindingId of bindingIds) {
    const update = runtime.updates[bindingId];
    if (
      update !== undefined &&
      (latest === undefined ||
        update.identity.sequence > latest.identity.sequence)
    ) {
      latest = update;
    }
  }
  return latest;
}

function statusPresentation(
  runtime: RuntimeViewState,
  sectionId: string,
  data: ReturnType<typeof readStatusSectionData>,
  update: RuntimeUpdate | undefined,
) {
  const messageValue = runtime.values[runtimeValueKey(sectionId, "message")];
  const levelValue = runtime.values[runtimeValueKey(sectionId, "level")];
  const progressValue =
    runtime.values[runtimeValueKey(sectionId, "progress")] ?? update?.progress;
  return {
    level: typeof levelValue === "string" ? levelValue : data.level,
    message:
      typeof messageValue === "string"
        ? messageValue
        : update?.message || data.message,
    progress:
      typeof progressValue === "number"
        ? Math.min(1, Math.max(0, progressValue))
        : null,
  };
}

export function StatusSection({ section }: { section: WorkspaceSection }) {
  const { actions, project, runtime } = useRealtime();
  const data = readStatusSectionData(section.data);
  const bindingIds = targetBindingIds(project.bindings, section.id);
  const invocation = activeInvocation(bindingIds, runtime);
  const { level, message, progress } = statusPresentation(
    runtime,
    section.id,
    data,
    latestUpdate(bindingIds, runtime),
  );
  return (
    <div className={`realtime-status realtime-status-${level}`} role="status">
      <div className="realtime-status-heading">
        <span>{message}</span>
        <span>
          {progress === null ? null : `${Math.round(progress * 100)}%`}
        </span>
      </div>
      {progress === null ? null : (
        <progress aria-label={message} max={1} value={progress} />
      )}
      {invocation === undefined ? null : (
        <button
          className="realtime-status-cancel"
          onClick={() => actions.cancel(invocation.identity)}
          type="button"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
