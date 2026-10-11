import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  type WorkspaceSection,
} from "@riteofstring/setta";

import { useRealtime } from "../app/runtimeContext";
import type {
  Binding,
  InvocationStatus,
  RuntimeUpdate,
} from "../api/generatedContract";
import { readHandlerSectionData } from "./sectionData";

const CANCELLABLE_STATES = new Set([
  "queued",
  "waiting",
  "running",
  "streaming",
]);

function bindingInputNames(binding: Binding): string[] {
  const joinInputs =
    binding.trigger.kind === "join" ? Object.keys(binding.trigger.inputs) : [];
  return [
    ...new Set([...Object.keys(binding.arguments), ...joinInputs]),
  ].sort();
}

function HandlerRuntime({
  invocation,
}: {
  invocation: InvocationStatus | undefined;
}) {
  const state = invocation?.state ?? "idle";
  return (
    <div className="realtime-handler-runtime">
      <span
        className={`realtime-handler-state realtime-handler-state-${state}`}
      >
        {state}
      </span>
      {invocation === undefined ? null : (
        <span title={invocation.identity.runId}>
          Run {invocation.identity.runId}
        </span>
      )}
    </div>
  );
}

function HandlerUpdate({ update }: { update: RuntimeUpdate | undefined }) {
  const progress = update?.progress;
  return (
    <>
      {update?.message ? (
        <p className="realtime-handler-message">{update.message}</p>
      ) : null}
      {progress === null || progress === undefined ? null : (
        <progress
          aria-label={update?.message || "Handler progress"}
          max={1}
          value={progress}
        />
      )}
    </>
  );
}

function HandlerSignature({ binding }: { binding: Binding }) {
  const inputNames = bindingInputNames(binding);
  const outputNames = Object.keys(binding.outputs).sort();
  return (
    <div className="realtime-handler-signature">
      <span>
        Inputs: {inputNames.length === 0 ? "none" : inputNames.join(", ")}
      </span>
      <span>
        Outputs: {outputNames.length === 0 ? "none" : outputNames.join(", ")}
      </span>
    </div>
  );
}

function HandlerFailure({
  invocation,
}: {
  invocation: InvocationStatus | undefined;
}) {
  if (invocation?.error === null || invocation?.error === undefined) {
    return null;
  }
  return (
    <p className="realtime-handler-error" role="alert">
      {invocation.error.message}
    </p>
  );
}

function HandlerCancel({
  invocation,
  onCancel,
}: {
  invocation: InvocationStatus | undefined;
  onCancel: (invocation: InvocationStatus) => void;
}) {
  if (invocation === undefined || !CANCELLABLE_STATES.has(invocation.state)) {
    return null;
  }
  return (
    <button
      className={`realtime-handler-cancel ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
      onClick={() => onCancel(invocation)}
      type="button"
    >
      Cancel
    </button>
  );
}

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
      <HandlerRuntime invocation={invocation} />
      <HandlerUpdate update={update} />
      <HandlerSignature binding={binding} />
      <HandlerFailure invocation={invocation} />
      <HandlerCancel
        invocation={invocation}
        onCancel={(current) => actions.cancel(current.identity)}
      />
    </div>
  );
}
