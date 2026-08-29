import type {
  DropzoneAcceptedResult,
  DropzoneRejection,
  DropzoneServerPickerRequest,
} from "../controls/dropzone/dropzoneTypes";
import type { WorkspaceHost } from "../workspaceHost";

type WorkspaceItemHandlerRegistrationBase = {
  sectionId: string;
  itemId: string;
};

export type WorkspaceDropzoneItemHandlerRegistration =
  WorkspaceItemHandlerRegistrationBase & {
    kind: "dropzone";
    onAccepted: (result: DropzoneAcceptedResult) => void;
    onRejected: (rejections: ReadonlyArray<DropzoneRejection>) => void;
    onServerFilePickerRequest?: (request: DropzoneServerPickerRequest) => void;
    onAttachmentRemove?: (attachmentId: string) => void;
  };

export type WorkspacePasswordItemHandlerRegistration =
  WorkspaceItemHandlerRegistrationBase & {
    kind: "password";
    onRevealSavedValue: () => void;
  };

export type WorkspaceItemHandlerRegistration =
  | WorkspaceDropzoneItemHandlerRegistration
  | WorkspacePasswordItemHandlerRegistration;

const registrationsByHost = new WeakMap<
  WorkspaceHost,
  Map<string, WorkspaceItemHandlerRegistration>
>();

function getRegistrations(
  host: WorkspaceHost,
): Map<string, WorkspaceItemHandlerRegistration> {
  const existing = registrationsByHost.get(host);
  if (existing) {
    return existing;
  }
  const registrations = new Map<string, WorkspaceItemHandlerRegistration>();
  registrationsByHost.set(host, registrations);
  return registrations;
}
type UnknownRecord = Record<string, unknown>;

function getRegistrationKey(sectionId: string, itemId: string): string {
  return JSON.stringify([sectionId, itemId]);
}

function assertRecord(
  value: unknown,
  owner: string,
): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} must be an object.`);
  }
}

function assertKnownFields(
  record: UnknownRecord,
  owner: string,
  fields: ReadonlyArray<string>,
) {
  const knownFields = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!knownFields.has(field)) {
      throw new Error(`${owner} contains the unknown field ${field}.`);
    }
  }
}

function assertHandler(value: unknown, owner: string) {
  if (typeof value !== "function") {
    throw new Error(`${owner} must be a function.`);
  }
}

function assertIdentityField(
  registration: UnknownRecord,
  field: "itemId" | "sectionId",
) {
  const value = registration[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `An item handler registration requires a nonblank ${field}.`,
    );
  }
}

function assertDropzoneRegistration(
  registration: UnknownRecord,
  owner: string,
) {
  assertKnownFields(registration, owner, [
    "itemId",
    "kind",
    "onAccepted",
    "onAttachmentRemove",
    "onRejected",
    "onServerFilePickerRequest",
    "sectionId",
  ]);
  assertHandler(registration["onAccepted"], `${owner} onAccepted`);
  assertHandler(registration["onRejected"], `${owner} onRejected`);
  if (registration["onServerFilePickerRequest"] !== undefined) {
    assertHandler(
      registration["onServerFilePickerRequest"],
      `${owner} onServerFilePickerRequest`,
    );
  }
  if (registration["onAttachmentRemove"] !== undefined) {
    assertHandler(
      registration["onAttachmentRemove"],
      `${owner} onAttachmentRemove`,
    );
  }
}

function assertRegistration(
  registration: unknown,
  owner: string,
): asserts registration is WorkspaceItemHandlerRegistration {
  assertRecord(registration, owner);
  assertIdentityField(registration, "sectionId");
  assertIdentityField(registration, "itemId");
  const identity = `${String(registration["sectionId"])}/${String(registration["itemId"])}`;
  if (registration["kind"] === "dropzone") {
    assertDropzoneRegistration(registration, `Item handler ${identity}`);
    return;
  }
  if (registration["kind"] === "password") {
    assertKnownFields(registration, `Item handler ${identity}`, [
      "itemId",
      "kind",
      "onRevealSavedValue",
      "sectionId",
    ]);
    assertHandler(
      registration["onRevealSavedValue"],
      `Item handler ${identity} onRevealSavedValue`,
    );
    return;
  }
  throw new Error(
    `Item handler ${identity} names the unknown handler kind ${String(registration["kind"])}.`,
  );
}

// Replaces the complete handler set. Values/configuration remain serializable document state;
// browser Files, host persistence, server pickers, attachment removal, and saved-secret actions
// cross this explicit function registry keyed by the stable section/item identity.
export function registerItemHandlers(
  host: WorkspaceHost,
  nextRegistrations: ReadonlyArray<WorkspaceItemHandlerRegistration>,
): void {
  if (!Array.isArray(nextRegistrations)) {
    throw new Error("Item handler registrations must be an array.");
  }
  const next = new Map<string, WorkspaceItemHandlerRegistration>();
  for (const [index, registration] of nextRegistrations.entries()) {
    assertRegistration(registration, `Item handler registration[${index}]`);
    const key = getRegistrationKey(registration.sectionId, registration.itemId);
    if (next.has(key)) {
      throw new Error(
        `Duplicate item handler registration for ${registration.sectionId}/${registration.itemId}.`,
      );
    }
    next.set(key, registration);
  }
  const registrations = getRegistrations(host);
  registrations.clear();
  for (const [key, registration] of next) {
    registrations.set(key, registration);
  }
}

export function getItemHandlerRegistration(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
): WorkspaceItemHandlerRegistration | null {
  return (
    getRegistrations(host).get(getRegistrationKey(sectionId, itemId)) ?? null
  );
}
