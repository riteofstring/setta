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
  invocations: Record<string, InvocationStatus>;
  latestByBinding: Record<string, InvocationIdentity>;
  logs: RuntimeLog[];
  sessionId: string | null;
  updates: Record<string, RuntimeUpdate>;
  values: Record<string, JsonValue>;
  workerState: string;
};

export const initialRuntimeViewState: RuntimeViewState = {
  connection: "connecting",
  error: null,
  invocations: {},
  latestByBinding: {},
  logs: [],
  sessionId: null,
  updates: {},
  values: {},
  workerState: "disconnected",
};

export function runtimeValueKey(sectionId: string, field: string): string {
  return `${sectionId}.${field}`;
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
  return {
    ...state,
    error: null,
    invocations,
    latestByBinding,
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

function isCurrentUpdate(
  state: RuntimeViewState,
  update: RuntimeUpdate,
): boolean {
  if (update.identity.sessionId !== state.sessionId) {
    return false;
  }
  const current = state.latestByBinding[update.identity.bindingId];
  return (
    current !== undefined &&
    current.invocationId === update.identity.invocationId &&
    current.sequence === update.identity.sequence
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
    const target = binding.outputs[outputName];
    if (target !== undefined) {
      values[runtimeValueKey(target.sectionId, target.field)] = value;
    }
  }
  return values;
}

function acceptUpdate(
  state: RuntimeViewState,
  update: RuntimeUpdate,
  project: Project,
): RuntimeViewState {
  if (!isCurrentUpdate(state, update)) {
    return state;
  }
  return {
    ...state,
    updates: {
      ...state.updates,
      [update.identity.bindingId]: update,
    },
    values: { ...state.values, ...outputValues(project, update) },
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
    latestByBinding: {},
    sessionId: null,
    updates: {},
    workerState: "replacing",
  };
}
