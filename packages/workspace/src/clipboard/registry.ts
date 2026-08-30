import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import { WORKSPACE_LOCAL_CLIPBOARD_PAYLOAD_VERSION } from "./types";
import type {
  WorkspaceClipboardAuthority,
  WorkspaceClipboardAuthorityMetadata,
  WorkspaceClipboardOperationLease,
  WorkspaceClipboardRuntimeListener,
  WorkspaceClipboardRuntimeState,
} from "./types";

type WorkspaceClipboardRuntime = {
  activeOperation: symbol | null;
  listeners: Set<WorkspaceClipboardRuntimeListener>;
  state: WorkspaceClipboardRuntimeState;
};

const runtimesByHost = new WeakMap<WorkspaceHost, WorkspaceClipboardRuntime>();

function assertAuthorityObject(authority: WorkspaceClipboardAuthority): void {
  if (!authority || typeof authority !== "object") {
    throw new Error("Workspace clipboard authority must be an object.");
  }
}

function assertAuthorityId(authority: WorkspaceClipboardAuthority): void {
  if (
    typeof authority.id !== "string" ||
    authority.id.trim() === "" ||
    authority.id !== authority.id.trim()
  ) {
    throw new Error(
      "Workspace clipboard authority requires a nonblank trimmed id.",
    );
  }
}

function assertKnownAuthorityFields(
  authority: WorkspaceClipboardAuthority,
  fields: ReadonlyArray<string>,
  authorityName: string,
): void {
  const knownFields = new Set(fields);
  for (const field of Object.keys(authority)) {
    if (!knownFields.has(field)) {
      throw new Error(
        `Workspace ${authorityName} clipboard authority has unknown field ${field}.`,
      );
    }
  }
}

function assertOptionalAuthorityCallback(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "function") {
    throw new Error(`Workspace local clipboard ${name} must be a function.`);
  }
}

function assertLocalClipboardAuthority(
  authority: Extract<WorkspaceClipboardAuthority, { kind: "local" }>,
): void {
  assertKnownAuthorityFields(
    authority,
    ["cloneItemData", "cloneSectionData", "id", "kind"],
    "local",
  );
  assertOptionalAuthorityCallback(authority.cloneItemData, "cloneItemData");
  assertOptionalAuthorityCallback(
    authority.cloneSectionData,
    "cloneSectionData",
  );
}

function assertDelegatedClipboardAuthority(
  authority: Extract<WorkspaceClipboardAuthority, { kind: "delegated" }>,
): void {
  assertKnownAuthorityFields(
    authority,
    ["id", "kind", "paste", "payloadVersion", "prepareCopy"],
    "delegated",
  );
  if (
    !Number.isInteger(authority.payloadVersion) ||
    authority.payloadVersion <= 0
  ) {
    throw new Error(
      "Workspace delegated clipboard authority payloadVersion must be a positive integer.",
    );
  }
  if (typeof authority.prepareCopy !== "function") {
    throw new Error(
      "Workspace delegated clipboard authority prepareCopy must be a function.",
    );
  }
  if (typeof authority.paste !== "function") {
    throw new Error(
      "Workspace delegated clipboard authority paste must be a function.",
    );
  }
}

function assertWorkspaceClipboardAuthority(
  authority: WorkspaceClipboardAuthority,
): void {
  assertAuthorityObject(authority);
  assertAuthorityId(authority);
  if (authority.kind === "local") {
    assertLocalClipboardAuthority(authority);
    return;
  }
  assertDelegatedClipboardAuthority(authority);
}

function publishWorkspaceClipboardRuntime(
  runtime: WorkspaceClipboardRuntime,
  state: WorkspaceClipboardRuntimeState,
): void {
  if (
    runtime.state.authority === state.authority &&
    runtime.state.disposed === state.disposed &&
    runtime.state.pending === state.pending
  ) {
    return;
  }
  runtime.state = state;
  for (const listener of runtime.listeners) {
    listener(state);
  }
}

function createWorkspaceClipboardRuntime(
  host: WorkspaceHost,
): WorkspaceClipboardRuntime {
  const runtime: WorkspaceClipboardRuntime = {
    activeOperation: null,
    listeners: new Set(),
    state: { authority: null, disposed: false, pending: false },
  };
  runtimesByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    runtime.activeOperation = null;
    publishWorkspaceClipboardRuntime(runtime, {
      authority: null,
      disposed: true,
      pending: false,
    });
    runtime.listeners.clear();
  });
  return runtime;
}

function getWorkspaceClipboardRuntime(
  host: WorkspaceHost,
): WorkspaceClipboardRuntime {
  const existing = runtimesByHost.get(host);
  if (existing) {
    return existing;
  }
  return createWorkspaceClipboardRuntime(host);
}

export function registerWorkspaceClipboardAuthority(
  host: WorkspaceHost,
  authority: WorkspaceClipboardAuthority,
): void {
  assertWorkspaceClipboardAuthority(authority);
  const runtime = getWorkspaceClipboardRuntime(host);
  if (runtime.state.disposed) {
    throw new Error(
      "Cannot register a clipboard authority on a disposed workspace host.",
    );
  }
  if (runtime.state.pending) {
    throw new Error(
      "Cannot replace a clipboard authority while an operation is pending.",
    );
  }
  publishWorkspaceClipboardRuntime(runtime, {
    authority,
    disposed: false,
    pending: false,
  });
}

export function getWorkspaceClipboardRuntimeState(
  host: WorkspaceHost,
): WorkspaceClipboardRuntimeState {
  return getWorkspaceClipboardRuntime(host).state;
}

export function getWorkspaceClipboardAuthorityMetadata(
  authority: WorkspaceClipboardAuthority,
): WorkspaceClipboardAuthorityMetadata {
  return {
    id: authority.id,
    payloadVersion:
      authority.kind === "local"
        ? WORKSPACE_LOCAL_CLIPBOARD_PAYLOAD_VERSION
        : authority.payloadVersion,
  };
}

export function subscribeWorkspaceClipboardAvailability(
  host: WorkspaceHost,
  listener: WorkspaceClipboardRuntimeListener,
): () => void {
  if (typeof listener !== "function") {
    throw new Error("Workspace clipboard listener must be a function.");
  }
  const runtime = getWorkspaceClipboardRuntime(host);
  if (runtime.state.disposed) {
    return () => undefined;
  }
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export function beginWorkspaceClipboardOperation(
  host: WorkspaceHost,
): WorkspaceClipboardOperationLease | null {
  const runtime = getWorkspaceClipboardRuntime(host);
  if (
    runtime.state.disposed ||
    runtime.state.authority === null ||
    runtime.activeOperation !== null
  ) {
    return null;
  }
  const token = Symbol("workspace-clipboard-operation");
  runtime.activeOperation = token;
  publishWorkspaceClipboardRuntime(runtime, {
    authority: runtime.state.authority,
    disposed: false,
    pending: true,
  });
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      if (runtime.activeOperation !== token) {
        return;
      }
      runtime.activeOperation = null;
      if (runtime.state.disposed) {
        return;
      }
      publishWorkspaceClipboardRuntime(runtime, {
        authority: runtime.state.authority,
        disposed: false,
        pending: false,
      });
    },
  };
}
