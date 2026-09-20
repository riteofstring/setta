import type { WorkspaceSection } from "@setta/workspace";

import {
  resolveRuntimeValue,
  runtimeCanInvoke,
  runtimeValueKey,
  type RuntimeViewState,
} from "../app/runtimeState";
import { useRealtime } from "../app/runtimeContext";
import { contentUrl } from "../api/client";
import {
  type ContentReference,
  type Binding,
  type InvocationStatus,
  validateContentReference,
} from "../api/generatedContract";
import { readOutputSectionData } from "./sectionData";

const ACTIVE_INVOCATION_STATES = new Set([
  "queued",
  "waiting",
  "running",
  "streaming",
]);
const FAILED_INVOCATION_STATES = new Set(["crashed", "failed", "timedOut"]);

type OutputState = {
  kind: "error" | "pending" | "saved";
  label: string;
};

function contentReference(value: unknown): ContentReference | null {
  return validateContentReference(value) ? value : null;
}

function presentValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function outputBindings(bindings: Binding[], sectionId: string): Binding[] {
  return bindings.filter((binding) =>
    Object.values(binding.outputs).some(
      (output) => output.target?.sectionId === sectionId,
    ),
  );
}

function latestInvocation(
  bindings: Binding[],
  invocations: Record<string, InvocationStatus>,
): InvocationStatus | undefined {
  const bindingIds = new Set(bindings.map((binding) => binding.id));
  let latest: InvocationStatus | undefined;
  for (const candidate of Object.values(invocations)) {
    if (
      bindingIds.has(candidate.identity.bindingId) &&
      (latest === undefined ||
        candidate.identity.sequence > latest.identity.sequence)
    ) {
      latest = candidate;
    }
  }
  return latest;
}

function activeLabel(invocation: InvocationStatus | undefined): string | null {
  if (invocation?.state === "queued") {
    return "queued";
  }
  return invocation !== undefined &&
    ACTIVE_INVOCATION_STATES.has(invocation.state)
    ? "running"
    : null;
}

function invocationFailed(invocation: InvocationStatus | undefined): boolean {
  return (
    invocation !== undefined &&
    (invocation.error !== null ||
      FAILED_INVOCATION_STATES.has(invocation.state))
  );
}

function retainedOutputState(
  invocation: InvocationStatus | undefined,
): OutputState {
  if (invocationFailed(invocation)) {
    return { kind: "error", label: "Saved result · Refresh failed" };
  }
  const active = activeLabel(invocation);
  if (active === "queued") {
    return { kind: "saved", label: "Saved result · Update queued" };
  }
  return active === "running"
    ? { kind: "saved", label: "Saved result · Updating" }
    : { kind: "saved", label: "Saved result" };
}

function initializationOutputState(
  invocation: InvocationStatus | undefined,
  canInvoke: boolean,
): OutputState {
  if (invocationFailed(invocation)) {
    return { kind: "error", label: "Initialization failed" };
  }
  const active = activeLabel(invocation);
  if (active === "running") {
    return { kind: "pending", label: "Initializing" };
  }
  if (active === "queued" || canInvoke) {
    return { kind: "pending", label: "Initialization queued" };
  }
  return { kind: "pending", label: "Waiting to initialize" };
}

function outputState(
  bindings: Binding[],
  runtime: RuntimeViewState,
  hasValue: boolean,
): OutputState | null {
  const retainedBindings = hasValue
    ? bindings.filter((binding) => runtime.retainedByBinding[binding.id])
    : [];
  if (retainedBindings.length > 0) {
    return retainedOutputState(
      latestInvocation(retainedBindings, runtime.invocations),
    );
  }
  const initializingBindings = bindings.filter(
    (binding) =>
      binding.materialization !== undefined &&
      binding.materialization.startup !== "manual",
  );
  if (hasValue || initializingBindings.length === 0) {
    return null;
  }
  return initializationOutputState(
    latestInvocation(initializingBindings, runtime.invocations),
    runtimeCanInvoke(runtime),
  );
}

function OutputContent({
  name,
  reference,
  value,
}: {
  name: string;
  reference: ContentReference | null;
  value: unknown;
}) {
  return reference?.mediaType.startsWith("image/") ? (
    <img
      alt={`${name} output`}
      className="realtime-output-image"
      src={contentUrl(reference)}
    />
  ) : (
    <pre className="realtime-output-value">{presentValue(value)}</pre>
  );
}

export function OutputSection({ section }: { section: WorkspaceSection }) {
  const { project, runtime } = useRealtime();
  const data = readOutputSectionData(section.data);
  const valueKey = runtimeValueKey(section.id, "value");
  const contentReferenceKey = runtimeValueKey(section.id, "contentRef");
  const value = resolveRuntimeValue(runtime.values, valueKey, data.value);
  const reference =
    contentReference(runtime.values[contentReferenceKey]) ??
    contentReference(value);
  const hasValue =
    Object.hasOwn(runtime.values, valueKey) ||
    Object.hasOwn(runtime.values, contentReferenceKey) ||
    (data.value !== null && data.value !== undefined);
  const state = outputState(
    outputBindings(project.bindings, section.id),
    runtime,
    hasValue,
  );
  if (state === null) {
    return (
      <OutputContent name={section.name} reference={reference} value={value} />
    );
  }
  return (
    <div className="realtime-output">
      <p
        className={`realtime-output-state realtime-output-state-${state.kind}`}
        role="status"
      >
        {state.label}
      </p>
      {!hasValue ? null : (
        <div className="realtime-output-content">
          <OutputContent
            name={section.name}
            reference={reference}
            value={value}
          />
        </div>
      )}
    </div>
  );
}
