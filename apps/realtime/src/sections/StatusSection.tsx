import type { WorkspaceSection } from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import { runtimeValueKey } from "../app/runtimeState";
import { readStatusSectionData } from "./sectionData";

export function StatusSection({ section }: { section: WorkspaceSection }) {
  const { actions, project, runtime } = useRealtime();
  const data = readStatusSectionData(section.data);
  const targetBindingIds = project.bindings
    .filter((binding) =>
      Object.values(binding.outputs).some(
        (target) => target.sectionId === section.id,
      ),
    )
    .map((binding) => binding.id);
  const activeInvocation = targetBindingIds
    .map((bindingId) => runtime.invocations[bindingId])
    .find((invocation) =>
      invocation === undefined
        ? false
        : ["queued", "running", "streaming"].includes(invocation.state),
    );
  const latestUpdate = targetBindingIds
    .map((bindingId) => runtime.updates[bindingId])
    .filter((update) => update !== undefined)
    .sort((left, right) => right.identity.sequence - left.identity.sequence)[0];
  const messageValue = runtime.values[runtimeValueKey(section.id, "message")];
  const levelValue = runtime.values[runtimeValueKey(section.id, "level")];
  const progressValue =
    runtime.values[runtimeValueKey(section.id, "progress")] ??
    latestUpdate?.progress;
  const message =
    typeof messageValue === "string"
      ? messageValue
      : latestUpdate?.message || data.message;
  const level = typeof levelValue === "string" ? levelValue : data.level;
  const progress =
    typeof progressValue === "number"
      ? Math.min(1, Math.max(0, progressValue))
      : null;
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
      {activeInvocation === undefined ? null : (
        <button
          className="realtime-status-cancel"
          onClick={() => actions.cancel(activeInvocation.identity)}
          type="button"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
