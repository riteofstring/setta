import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  type WorkspaceSection,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import { readHandlerSectionData } from "./sectionData";

const CANCELLABLE_STATES = new Set([
  "queued",
  "waiting",
  "running",
  "streaming",
]);

export function HandlerSection({ section }: { section: WorkspaceSection }) {
  const { actions, project, runtime } = useRealtime();
  const { bindingId } = readHandlerSectionData(section.data);
  const binding = project.bindings.find(
    (candidate) => candidate.id === bindingId,
  );
  if (binding === undefined) {
    return (
      <div className="realtime-handler realtime-handler-invalid" role="alert">
        Binding {bindingId} is missing.
      </div>
    );
  }
  const invocation = runtime.invocations[bindingId];
  const update = runtime.updates[bindingId];
  const available = runtime.handlers.includes(binding.handler);
  const state = invocation?.state ?? "idle";
  const inputNames = [
    ...new Set([
      ...Object.keys(binding.arguments),
      ...(binding.trigger.kind === "join"
        ? Object.keys(binding.trigger.inputs)
        : []),
    ]),
  ].sort();
  const outputNames = Object.keys(binding.outputs).sort();
  const canCancel =
    invocation !== undefined && CANCELLABLE_STATES.has(invocation.state);
  return (
    <div className="realtime-handler" data-invocation-state={state}>
      <div className="realtime-handler-heading">
        <code>{binding.handler}</code>
        <span
          className={`realtime-handler-availability realtime-handler-availability-${available ? "available" : "missing"}`}
        >
          {available ? "available" : "missing"}
        </span>
      </div>
      <div className="realtime-handler-runtime">
        <span className={`realtime-handler-state realtime-handler-state-${state}`}>
          {state}
        </span>
        {invocation === undefined ? null : (
          <span title={invocation.identity.runId}>
            Run {invocation.identity.runId}
          </span>
        )}
      </div>
      {update?.message ? (
        <p className="realtime-handler-message">{update.message}</p>
      ) : null}
      {update?.progress === null || update?.progress === undefined ? null : (
        <progress aria-label={update.message || "Handler progress"} max={1} value={update.progress} />
      )}
      <div className="realtime-handler-signature">
        <span>Inputs: {inputNames.length === 0 ? "none" : inputNames.join(", ")}</span>
        <span>
          Outputs: {outputNames.length === 0 ? "none" : outputNames.join(", ")}
        </span>
      </div>
      {invocation?.error === null || invocation?.error === undefined ? null : (
        <p className="realtime-handler-error" role="alert">
          {invocation.error.message}
        </p>
      )}
      {canCancel ? (
        <button
          className={`realtime-handler-cancel ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
          onClick={() => actions.cancel(invocation.identity)}
          type="button"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
