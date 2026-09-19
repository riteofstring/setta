import {
  type ExportResult,
  type MutationResult,
  type ResolvedEvidence,
  type ReviewMutation,
  type ReviewSnapshot,
  type StructuredError,
  validateReviewMutation,
  validateReviewRequest,
  validateReviewResponse,
  validateReviewSnapshot,
} from "./generatedContract";

export const REVIEW_PATH = "/api/v1/review";
export const REVIEW_APPLY_PATH = "/api/v1/review/apply";
export const REVIEW_EVENTS_PATH = "/api/v1/review/events";
export const REVIEW_EXPORT_PATH = "/api/v1/review/export";

export class ReviewClientError extends Error {
  public constructor(
    public readonly kind:
      "network" | "http" | "invalid-request" | "invalid-response",
    message: string,
    public readonly status?: number,
    public readonly structuredError?: StructuredError,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ReviewClientError";
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClosedRecord(
  value: unknown,
  keys: ReadonlyArray<string>,
): value is UnknownRecord {
  if (!isRecord(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  );
}

function isRequiredText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("\0")
  );
}

function isNullableRequiredText(value: unknown): value is string | null {
  return value === null || isRequiredText(value);
}

function isNullableIdentifier(value: unknown): value is string | null {
  return value === null || isIdentifier(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isStructuredError(value: unknown): value is StructuredError {
  return (
    isClosedRecord(value, [
      "code",
      "message",
      "field",
      "requestId",
      "evidenceId",
    ]) &&
    isIdentifier(value.code) &&
    isRequiredText(value.message) &&
    isNullableRequiredText(value.field) &&
    isNullableIdentifier(value.requestId) &&
    isNullableIdentifier(value.evidenceId)
  );
}

function invalidResponse(message: string, cause?: unknown): ReviewClientError {
  return new ReviewClientError(
    "invalid-response",
    message,
    undefined,
    undefined,
    cause,
  );
}

function assertSnapshot(value: unknown): ReviewSnapshot {
  if (!validateReviewSnapshot(value)) {
    throw invalidResponse("Review received an invalid snapshot.");
  }
  return value;
}

function assertMutationResult(
  value: unknown,
  mutation: ReviewMutation,
): MutationResult {
  if (
    !isClosedRecord(value, ["version", "snapshot"]) ||
    value.version !== 1 ||
    !validateReviewSnapshot(value.snapshot) ||
    value.snapshot.project.id !== mutation.projectId ||
    value.snapshot.revision !== mutation.expectedRevision + 1
  ) {
    throw invalidResponse("Review received an invalid mutation result.");
  }
  return value as MutationResult;
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isGitDiffContent(value: UnknownRecord): boolean {
  return (
    isClosedRecord(value, ["kind", "unifiedDiff", "truncated"]) &&
    typeof value.unifiedDiff === "string" &&
    typeof value.truncated === "boolean"
  );
}

function isTextContent(value: UnknownRecord): boolean {
  return (
    isClosedRecord(value, [
      "kind",
      "text",
      "startLine",
      "endLine",
      "truncated",
    ]) &&
    typeof value.text === "string" &&
    Number.isSafeInteger(value.startLine) &&
    Number(value.startLine) > 0 &&
    Number.isSafeInteger(value.endLine) &&
    Number(value.endLine) > 0 &&
    typeof value.truncated === "boolean"
  );
}

function isArtifactContent(value: UnknownRecord): boolean {
  return (
    isClosedRecord(value, [
      "kind",
      "route",
      "mediaType",
      "byteLength",
      "sha256",
    ]) &&
    typeof value.route === "string" &&
    value.route.startsWith("/") &&
    isRequiredText(value.mediaType) &&
    isNonNegativeInteger(value.byteLength) &&
    isSha256(value.sha256)
  );
}

function isResolvedEvidenceContent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "gitDiff":
      return isGitDiffContent(value);
    case "text":
      return isTextContent(value);
    case "json":
      return isClosedRecord(value, ["kind", "json"]) && isJsonValue(value.json);
    case "artifact":
      return isArtifactContent(value);
    default:
      return false;
  }
}

function isResolvedEvidence(value: unknown): value is ResolvedEvidence {
  if (
    !isClosedRecord(value, ["evidenceId", "status", "content", "error"]) ||
    !isIdentifier(value.evidenceId)
  ) {
    return false;
  }
  if (value.status === "resolved") {
    return value.error === null && isResolvedEvidenceContent(value.content);
  }
  if (value.status === "failed") {
    return value.content === null && isStructuredError(value.error);
  }
  return false;
}

function isContinuationEnvelope(
  value: unknown,
  projectId: string,
): value is UnknownRecord {
  return (
    isClosedRecord(value, [
      "version",
      "projectId",
      "request",
      "requestSha256",
      "response",
      "evidence",
    ]) &&
    value.version === 1 &&
    value.projectId === projectId
  );
}

function hasMatchingContinuationContracts(value: UnknownRecord): boolean {
  if (
    !validateReviewRequest(value.request) ||
    !isSha256(value.requestSha256) ||
    !validateReviewResponse(value.response)
  ) {
    return false;
  }
  return (
    value.response.requestId === value.request.id &&
    value.response.requestSha256 === value.requestSha256
  );
}

function hasResolvedContinuationEvidence(value: UnknownRecord): boolean {
  return (
    Array.isArray(value.evidence) && value.evidence.every(isResolvedEvidence)
  );
}

function isContinuation(value: unknown, projectId: string): boolean {
  return (
    isContinuationEnvelope(value, projectId) &&
    hasMatchingContinuationContracts(value) &&
    hasResolvedContinuationEvidence(value)
  );
}

type ExportEnvelope = UnknownRecord & { export: UnknownRecord };

function isExportEnvelope(value: unknown): value is ExportEnvelope {
  return (
    isClosedRecord(value, ["version", "export"]) &&
    value.version === 1 &&
    isClosedRecord(value.export, [
      "version",
      "projectId",
      "revision",
      "responses",
      "continuations",
    ])
  );
}

function hasValidExportIdentity(document: UnknownRecord): boolean {
  return (
    document.version === 1 &&
    isIdentifier(document.projectId) &&
    isNonNegativeInteger(document.revision)
  );
}

function hasValidExportResponses(document: UnknownRecord): boolean {
  return (
    Array.isArray(document.responses) &&
    document.responses.every(validateReviewResponse)
  );
}

function hasValidExportContinuations(
  document: UnknownRecord,
  includeContinuations: boolean,
): boolean {
  if (!Array.isArray(document.continuations)) {
    return false;
  }
  if (!includeContinuations && document.continuations.length !== 0) {
    return false;
  }
  if (!isIdentifier(document.projectId)) {
    return false;
  }
  return document.continuations.every((continuation) =>
    isContinuation(continuation, document.projectId as string),
  );
}

function isExportDocument(
  document: UnknownRecord,
  includeContinuations: boolean,
): boolean {
  return (
    hasValidExportIdentity(document) &&
    hasValidExportResponses(document) &&
    hasValidExportContinuations(document, includeContinuations)
  );
}

function assertExportResult(
  value: unknown,
  includeContinuations: boolean,
): ExportResult {
  if (!isExportEnvelope(value)) {
    throw invalidResponse("Review received an invalid export result.");
  }
  if (!isExportDocument(value.export, includeContinuations)) {
    throw invalidResponse("Review received an invalid export result.");
  }
  return value as ExportResult;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw invalidResponse(
      "Review received a response that was not JSON.",
      error,
    );
  }
}

async function throwHttpError(response: Response): Promise<never> {
  let payload: unknown;
  let cause: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    cause = error;
  }
  const structuredError = isStructuredError(payload) ? payload : undefined;
  throw new ReviewClientError(
    "http",
    structuredError?.message ??
      `Review request failed with HTTP ${String(response.status)}.`,
    response.status,
    structuredError,
    cause,
  );
}

async function request(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  try {
    const response = await fetchImplementation(path, init);
    if (!response.ok) {
      await throwHttpError(response);
    }
    return response;
  } catch (error) {
    if (error instanceof ReviewClientError) {
      throw error;
    }
    throw new ReviewClientError(
      "network",
      "Review could not reach the local host.",
      undefined,
      undefined,
      error,
    );
  }
}

export async function fetchReviewSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<ReviewSnapshot> {
  const response = await request(
    REVIEW_PATH,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
  return assertSnapshot(await readJson(response));
}

export async function applyReviewMutation(
  mutation: ReviewMutation,
  fetchImplementation: typeof fetch = fetch,
): Promise<MutationResult> {
  if (!validateReviewMutation(mutation)) {
    throw new ReviewClientError(
      "invalid-request",
      "Review generated an invalid mutation.",
    );
  }
  const response = await request(
    REVIEW_APPLY_PATH,
    {
      body: JSON.stringify(mutation),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetchImplementation,
  );
  return assertMutationResult(await readJson(response), mutation);
}

export async function exportReview(
  includeContinuations: boolean,
  fetchImplementation: typeof fetch = fetch,
): Promise<ExportResult> {
  const path = includeContinuations
    ? `${REVIEW_EXPORT_PATH}?continuations=true`
    : REVIEW_EXPORT_PATH;
  const response = await request(
    path,
    { headers: { Accept: "application/json" }, method: "POST" },
    fetchImplementation,
  );
  return assertExportResult(await readJson(response), includeContinuations);
}

export type ReviewEventSource = {
  addEventListener(type: string, listener: EventListener): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
  removeEventListener(type: string, listener: EventListener): void;
};

export function subscribeReviewSnapshots(
  handlers: {
    onError?: (event: Event) => void;
    onInvalid: (error: unknown) => void;
    onSnapshot: (snapshot: ReviewSnapshot) => void;
  },
  createEventSource: (path: string) => ReviewEventSource = (path) =>
    new EventSource(path),
): () => void {
  const source = createEventSource(REVIEW_EVENTS_PATH);
  const listener: EventListener = (event) => {
    let snapshot: ReviewSnapshot;
    try {
      snapshot = assertSnapshot(
        JSON.parse(String((event as MessageEvent).data)),
      );
    } catch (error) {
      source.removeEventListener("snapshot", listener);
      source.close();
      handlers.onInvalid(error);
      return;
    }
    handlers.onSnapshot(snapshot);
  };
  source.addEventListener("snapshot", listener);
  source.onerror = (event) => handlers.onError?.(event);
  return () => {
    source.removeEventListener("snapshot", listener);
    source.close();
  };
}
