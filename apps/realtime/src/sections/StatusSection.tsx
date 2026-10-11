import type { WorkspaceSection } from "@riteofstring/setta";

import { useRealtime } from "../app/runtimeContext";
import {
  resolveRuntimeValue,
  runtimeValueKey,
  type RuntimeViewState,
} from "../app/runtimeState";
import type {
  Binding,
  InvocationStatus,
  RuntimeUpdate,
} from "../api/generatedContract";
import { readStatusSectionData } from "./sectionData";

const ACTIVE_INVOCATION_STATES = new Set([
  "queued",
  "waiting",
  "running",
  "streaming",
]);

function targetBindingIds(bindings: Binding[], sectionId: string): string[] {
  return bindings
    .filter((binding) =>
      Object.values(binding.outputs).some(
        (output) => output.target?.sectionId === sectionId,
      ),
    )
    .map((binding) => binding.id);
}

function latestInvocation(
  bindingIds: string[],
  runtime: RuntimeViewState,
): InvocationStatus | undefined {
  let latest: InvocationStatus | undefined;
  for (const bindingId of bindingIds) {
    const invocation = runtime.invocations[bindingId];
    if (
      invocation !== undefined &&
      (latest === undefined ||
        invocation.identity.sequence > latest.identity.sequence)
    ) {
      latest = invocation;
    }
  }
  return latest;
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
  const progressValue = resolveRuntimeValue(
    runtime.values,
    runtimeValueKey(sectionId, "progress"),
    update?.progress ?? null,
  );
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

function StatusProgress({
  message,
  progress,
}: {
  message: string;
  progress: number | null;
}) {
  if (progress === null) {
    return null;
  }
  return <progress aria-label={message} max={1} value={progress} />;
}

function InvocationControl({
  invocation,
  onCancel,
}: {
  invocation: InvocationStatus | undefined;
  onCancel: (invocation: InvocationStatus) => void;
}) {
  if (invocation === undefined) {
    return null;
  }
  const active = ACTIVE_INVOCATION_STATES.has(invocation.state);
  return (
    <>
      <span className="realtime-status-invocation">{invocation.state}</span>
      {!active ? null : (
        <button
          className="realtime-status-cancel"
          onClick={() => onCancel(invocation)}
          type="button"
        >
          Cancel
        </button>
      )}
    </>
  );
}

export function StatusSection({ section }: { section: WorkspaceSection }) {
  const { actions, project, runtime } = useRealtime();
  const data = readStatusSectionData(section.data);
  const bindingIds = targetBindingIds(project.bindings, section.id);
  const invocation = latestInvocation(bindingIds, runtime);
  const presentation = statusPresentation(
    runtime,
    section.id,
    data,
    latestUpdate(bindingIds, runtime),
  );
  const level = invocation?.error ? "error" : presentation.level;
  const message = invocation?.error?.message ?? presentation.message;
  return (
    <div className={`realtime-status realtime-status-${level}`} role="status">
      <div className="realtime-status-heading">
        <span>{message}</span>
        <span>
          {presentation.progress === null
            ? null
            : `${Math.round(presentation.progress * 100)}%`}
        </span>
      </div>
      <InvocationControl
        invocation={invocation}
        onCancel={(current) => actions.cancel(current.identity)}
      />
      <StatusProgress message={message} progress={presentation.progress} />
    </div>
  );
}
