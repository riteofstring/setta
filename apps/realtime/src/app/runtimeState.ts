import type {
  InvocationIdentity,
  InvocationStatus,
  JsonValue,
  Project,
  RuntimeEnvelope,
  RuntimeSnapshot,
  RuntimeUpdate,
  StructuredError,
} from "../backend/generatedContract";

type RuntimeConnectionState =
  "connecting" | "connected" | "disconnected" | "invalid";

type RuntimeLog = Extract<RuntimeEnvelope, { type: "log" }>["log"];

export type RuntimeViewState = {
  connection: RuntimeConnectionState;
  error: StructuredError | null;
  handlers: string[];
  invocations: Record<string, InvocationStatus>;
  latestByBinding: Record<string, InvocationIdentity>;
  logs: RuntimeLog[];
  publishedByBinding: Record<string, InvocationIdentity>;
  retainedByBinding: Record<string, boolean>;
  sessionId: string | null;
  updates: Record<string, RuntimeUpdate>;
  values: Record<string, JsonValue>;
  workerState: string;
};

export const initialRuntimeViewState: RuntimeViewState = {
  connection: "connecting",
  error: null,
  handlers: [],
  invocations: {},
  latestByBinding: {},
  logs: [],
  publishedByBinding: {},
  retainedByBinding: {},
  sessionId: null,
  updates: {},
  values: {},
  workerState: "disconnected",
};

export function runtimeValueKey(sectionId: string, field: string): string {
  return `${sectionId}.${field}`;
}

export function resolveRuntimeValue(
  values: Record<string, JsonValue>,
  key: string,
  fallback: JsonValue,
): JsonValue {
  return Object.hasOwn(values, key) ? values[key]! : fallback;
}

export function runtimeCanInvoke(state: RuntimeViewState): boolean {
  return (
    state.connection === "connected" &&
    state.sessionId !== null &&
    state.workerState === "ready"
  );
}

function compareIdentity(
  left: InvocationIdentity,
  right: InvocationIdentity,
): number {
  if (left.sequence !== right.sequence) {
    return left.sequence > right.sequence ? 1 : -1;
  }
  if (left.invocationId === right.invocationId) {
    return 0;
  }
  return left.invocationId > right.invocationId ? 1 : -1;
}

function latestInvocations(snapshot: RuntimeSnapshot): {
  invocations: Record<string, InvocationStatus>;
  latestByBinding: Record<string, InvocationIdentity>;
} {
  const invocations: Record<string, InvocationStatus> = {};
  const latestByBinding: Record<string, InvocationIdentity> = {};
  for (const invocation of Object.values(snapshot.invocations)) {
    const previous = latestByBinding[invocation.identity.bindingId];
    if (previous && compareIdentity(invocation.identity, previous) < 0) {
      continue;
    }
    latestByBinding[invocation.identity.bindingId] = invocation.identity;
    invocations[invocation.identity.bindingId] = invocation;
  }
  return { invocations, latestByBinding };
}

function replaceSnapshot(
  state: RuntimeViewState,
  snapshot: RuntimeSnapshot,
): RuntimeViewState {
  const { invocations, latestByBinding } = latestInvocations(snapshot);
  const sessionChanged = state.sessionId !== snapshot.sessionId;
  return {
    ...state,
    error: sessionChanged ? null : state.error,
    handlers: [...snapshot.handlers],
    invocations,
    latestByBinding,
    logs: sessionChanged ? [] : state.logs,
    publishedByBinding: { ...snapshot.publishedByBinding },
    retainedByBinding: { ...snapshot.retainedByBinding },
    sessionId: snapshot.sessionId,
    updates: {},
    values: { ...snapshot.values },
    workerState: snapshot.workerState,
  };
}

function acceptInvocation(
  state: RuntimeViewState,
  invocation: InvocationStatus,
): RuntimeViewState {
  if (invocation.identity.sessionId !== state.sessionId) {
    return state;
  }
  const bindingId = invocation.identity.bindingId;
  const previous = state.latestByBinding[bindingId];
  if (previous && compareIdentity(invocation.identity, previous) < 0) {
    return state;
  }
  if (
    previous &&
    previous.sequence === invocation.identity.sequence &&
    previous.invocationId !== invocation.identity.invocationId
  ) {
    return state;
  }
  return {
    ...state,
    invocations: { ...state.invocations, [bindingId]: invocation },
    latestByBinding: {
      ...state.latestByBinding,
      [bindingId]: invocation.identity,
    },
  };
}

function isIdentityCurrent(
  identity: InvocationIdentity,
  previous: InvocationIdentity | undefined,
): boolean {
  return (
    previous === undefined ||
    (identity.sequence === previous.sequence
      ? identity.invocationId === previous.invocationId
      : identity.sequence > previous.sequence)
  );
}

function outputValues(
  project: Project,
  update: RuntimeUpdate,
): Record<string, JsonValue> {
  const binding = project.bindings.find(
    (candidate) => candidate.id === update.identity.bindingId,
  );
  if (binding === undefined) {
    return {};
  }
  const values: Record<string, JsonValue> = {};
  for (const [outputName, value] of Object.entries(update.outputs)) {
    const target = binding.outputs[outputName]?.target;
    if (target !== undefined) {
      values[runtimeValueKey(target.sectionId, target.field)] = value;
    }
  }
  return values;
}

function acceptsUpdatePresentation(
  state: RuntimeViewState,
  update: RuntimeUpdate,
): boolean {
  const bindingId = update.identity.bindingId;
  const previous = state.updates[bindingId];
  return (
    isIdentityCurrent(update.identity, previous?.identity) &&
    (previous === undefined ||
      previous.identity.invocationId !== update.identity.invocationId ||
      update.updateSequence > previous.updateSequence) &&
    isIdentityCurrent(update.identity, state.publishedByBinding[bindingId])
  );
}

function acceptsUpdateOutputs(
  state: RuntimeViewState,
  update: RuntimeUpdate,
): boolean {
  const previous = state.updates[update.identity.bindingId];
  return (
    Object.keys(update.outputs).length > 0 &&
    (previous === undefined ||
      previous.identity.invocationId !== update.identity.invocationId ||
      update.updateSequence > previous.updateSequence) &&
    isIdentityCurrent(
      update.identity,
      state.publishedByBinding[update.identity.bindingId],
    )
  );
}

function acceptUpdate(
  state: RuntimeViewState,
  update: RuntimeUpdate,
  project: Project,
): RuntimeViewState {
  if (update.identity.sessionId !== state.sessionId) {
    return state;
  }
  const bindingId = update.identity.bindingId;
  const acceptsPresentation = acceptsUpdatePresentation(state, update);
  const acceptsOutputs = acceptsUpdateOutputs(state, update);
  if (!acceptsPresentation && !acceptsOutputs) {
    return state;
  }
  return {
    ...state,
    publishedByBinding: acceptsOutputs
      ? { ...state.publishedByBinding, [bindingId]: update.identity }
      : state.publishedByBinding,
    retainedByBinding: acceptsOutputs
      ? { ...state.retainedByBinding, [bindingId]: false }
      : state.retainedByBinding,
    updates: acceptsPresentation
      ? { ...state.updates, [bindingId]: update }
      : state.updates,
    values: acceptsOutputs
      ? { ...state.values, ...outputValues(project, update) }
      : state.values,
  };
}

export function applyRuntimeEnvelope(
  state: RuntimeViewState,
  envelope: RuntimeEnvelope,
  project: Project,
): RuntimeViewState {
  switch (envelope.type) {
    case "snapshot":
      return replaceSnapshot(state, envelope.snapshot);
    case "invocation":
      return acceptInvocation(state, envelope.invocation);
    case "update":
      return acceptUpdate(state, envelope.update, project);
    case "log":
      return { ...state, logs: [...state.logs, envelope.log].slice(-200) };
    case "error":
      return { ...state, error: envelope.error };
  }
}

export function setRuntimeConnection(
  state: RuntimeViewState,
  connection: RuntimeConnectionState,
): RuntimeViewState {
  return state.connection === connection ? state : { ...state, connection };
}

export function beginRuntimeReplacement(
  state: RuntimeViewState,
): RuntimeViewState {
  return {
    ...state,
    connection: "connecting",
    error: null,
    invocations: {},
    handlers: [],
    latestByBinding: {},
    publishedByBinding: {},
    sessionId: null,
    updates: {},
    workerState: "replacing",
  };
}
