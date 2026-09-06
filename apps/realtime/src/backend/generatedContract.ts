import {
  validateContentReferenceDocument,
  validateProjectDocument,
  validateRuntimeCommandDocument,
  validateRuntimeEnvelopeDocument,
} from "./generatedValidators.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | Array<JsonValue>
  | { [key: string]: JsonValue };

export type SizeValue = number | "auto";

export type RuntimeDeclaration = {
  kind: string;
  entrypoint: string;
};

export type Section = {
  id: string;
  kind: "input" | "output" | "button" | "status" | "drawing";
  name: string;
  width: SizeValue;
  height: SizeValue;
  overflowMode: boolean;
  positionAndSizeLocked: boolean;
  isHorizontalOrientation: boolean;
  styleColor: string | null;
  tagColor: string | null;
  children: Array<string>;
  data: JsonValue;
};

export type TopLevelSectionLayout = {
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  zIndex: number;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type Binding = {
  id: string;
  trigger: { sectionId: string; event: "change" | "submit" | "press" | "snapshot" };
  handler: string;
  arguments: Record<string, JsonValue>;
  scheduling: {
    mode: "once" | "latest" | "parallel";
    debounceMilliseconds: number;
    concurrencyGroup: string;
    concurrencyLimit: number;
  };
  outputs: Record<string, { sectionId: string; field: string }>;
};

export type Project = {
  version: 1;
  id: string;
  revision: number;
  name: string;
  runtime: RuntimeDeclaration;
  sections: Record<string, Section>;
  layout: {
    topLevelSections: Record<string, TopLevelSectionLayout>;
    viewport: Viewport | null;
  };
  bindings: Array<Binding>;
  configuration: Record<string, JsonValue>;
};

export type InvocationIdentity = {
  sessionId: string;
  bindingId: string;
  invocationId: string;
  sequence: number;
};

export type StructuredError = {
  code: string;
  message: string;
};

export type ContentReference = {
  id: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
  invocationId: string;
};

export type InvocationStatus = {
  identity: InvocationIdentity;
  state:
    | "queued"
    | "running"
    | "streaming"
    | "completed"
    | "cancelled"
    | "timedOut"
    | "failed"
    | "crashed"
    | "superseded";
  error: StructuredError | null;
};

export type RuntimeSnapshot = {
  sessionId: string;
  workerState: "stopped" | "starting" | "ready" | "failed" | "replacing";
  values: Record<string, JsonValue>;
  invocations: Record<string, InvocationStatus>;
};

export type RuntimeUpdate = {
  identity: InvocationIdentity;
  progress: number | null;
  message: string;
  outputs: Record<string, JsonValue>;
};

export type RuntimeEnvelope =
  | { type: "snapshot"; snapshot: RuntimeSnapshot }
  | { type: "invocation"; invocation: InvocationStatus }
  | { type: "update"; update: RuntimeUpdate }
  | { type: "log"; log: { stream: "stdout" | "stderr"; text: string } }
  | { type: "error"; error: StructuredError };

export type RuntimeEvent = {
  type: "event";
  sessionId: string;
  sectionId: string;
  event: "change" | "submit" | "press" | "snapshot";
  payload: JsonValue;
};

export type RuntimeCancelRequest = {
  type: "cancel";
  identity: InvocationIdentity;
};

export type RuntimeCommand = RuntimeEvent | RuntimeCancelRequest;

export function validateProject(value: unknown): value is Project {
  return validateProjectDocument(value);
}

export function validateRuntimeEnvelope(value: unknown): value is RuntimeEnvelope {
  return validateRuntimeEnvelopeDocument(value);
}

export function validateRuntimeCommand(value: unknown): value is RuntimeCommand {
  return validateRuntimeCommandDocument(value);
}

export function validateContentReference(value: unknown): value is ContentReference {
  return validateContentReferenceDocument(value);
}
