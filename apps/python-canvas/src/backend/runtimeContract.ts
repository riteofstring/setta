import {
  DIAGNOSTIC_SEVERITY_ERROR_V2,
  DIAGNOSTIC_SEVERITY_INFORMATION_V2,
  DIAGNOSTIC_SEVERITY_WARNING_V2,
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2,
  PROJECT_SNAPSHOT_VERSION_V2,
  PROVIDER_AVAILABILITY_AVAILABLE_V2,
  PROVIDER_AVAILABILITY_UNAVAILABLE_V2,
  PROVIDER_BASEDPYRIGHT_V2,
  PROVIDER_LIFECYCLE_STATE_FAILED_V2,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2,
  PROVIDER_LIFECYCLE_STATE_PENDING_V2,
  PROVIDER_LIFECYCLE_STATE_READY_V2,
  type APIErrorCodeV2,
  type APIErrorV2,
  type ByteRangeV2,
  type CallableV2,
  type CompletionItemV2,
  type CompletionResponseV2,
  type DiagnosticSeverityV2,
  type DiagnosticV2,
  type ErrorResponseV2,
  type GeneratedCodeV2,
  type ParameterPassingStyleV2,
  type ParameterV2,
  type ProjectSnapshotV2,
  type ProjectV2,
  type ProviderAvailabilityV2,
  type ProviderLifecycleStateV2,
  type ProviderStatusV2,
  type PythonTargetV2,
} from "./generatedContract";

export class ProjectSnapshotValidationError extends Error {
  public readonly name = "ProjectSnapshotValidationError";

  public constructor(
    public readonly field: string,
    problem: string,
  ) {
    super(`Invalid ProjectSnapshotV2 ${field}: ${problem}.`);
  }
}

const encoder = new TextEncoder();

export function parseProjectSnapshotV2(value: unknown): ProjectSnapshotV2 {
  const record = readClosedRecord(value, "snapshot", [
    "version",
    "project",
    "pythonTarget",
    "callables",
    "generatedCode",
    "diagnostics",
    "providerStatus",
  ]);
  const version = readString(record.version, "version");
  if (version !== PROJECT_SNAPSHOT_VERSION_V2) {
    fail("version", "is not supported");
  }

  const project = parseProject(record.project);
  const pythonTarget = parsePythonTarget(record.pythonTarget);
  const targetIds = new Set<string>();
  const callables = parseCallables(record.callables, targetIds);
  const generatedCode = parseGeneratedCode(
    record.generatedCode,
    pythonTarget,
    targetIds,
  );
  const diagnostics = parseDiagnostics(
    record.diagnostics,
    generatedCode.code,
    targetIds,
  );

  return {
    version: PROJECT_SNAPSHOT_VERSION_V2,
    project,
    pythonTarget,
    callables,
    generatedCode,
    diagnostics,
    providerStatus: parseProviderStatus(record.providerStatus),
  };
}

export function parseErrorResponseV2(value: unknown): ErrorResponseV2 {
  const response = readClosedRecord(value, "error response", ["error"]);
  const errorRecord = readPlainRecord(response.error, "error response.error");
  const code = parseApiErrorCode(errorRecord.code);
  const message = readNonBlankString(
    errorRecord.message,
    "error response.error.message",
  );

  if (code === "revision_conflict") {
    requireExactEnumerableKeys(
      errorRecord,
      ["code", "message", "expectedRevision", "currentRevision"],
      "error response.error",
    );
    return {
      error: {
        code,
        currentRevision: readPositiveInteger(
          errorRecord.currentRevision,
          "error response.error.currentRevision",
        ),
        expectedRevision: readPositiveInteger(
          errorRecord.expectedRevision,
          "error response.error.expectedRevision",
        ),
        message,
      },
    };
  }

  requireExactEnumerableKeys(
    errorRecord,
    ["code", "message"],
    "error response.error",
  );
  const error: APIErrorV2 = { code, message };
  return { error };
}

export function parseCompletionResponseV2(
  value: unknown,
): CompletionResponseV2 {
  const response = readClosedRecord(value, "completion response", ["items"]);
  return {
    items: readArray(
      response.items,
      "completion response.items",
      parseCompletionItem,
    ),
  };
}

function parseProject(value: unknown): ProjectV2 {
  const record = readClosedRecord(value, "project", ["id", "name", "revision"]);
  const id = readString(record.id, "project.id");
  requireStableId("project.id", id);
  const name = readNonBlankString(record.name, "project.name");
  if (name !== name.trim()) {
    fail("project.name", "must not include surrounding whitespace");
  }
  return {
    id,
    name,
    revision: readPositiveInteger(record.revision, "project.revision"),
  };
}

function parsePythonTarget(value: unknown): PythonTargetV2 {
  const record = readClosedRecord(value, "pythonTarget", ["prefix", "suffix"]);
  return {
    prefix: readText(record.prefix, "pythonTarget.prefix", true),
    suffix: readText(record.suffix, "pythonTarget.suffix", true),
  };
}

function parseCallables(value: unknown, targetIds: Set<string>): CallableV2[] {
  return readArray(value, "callables", (entry, index) => {
    const field = `callables[${String(index)}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "name",
      "authoredExpression",
      "parameters",
    ]);
    const id = readString(record.id, `${field}.id`);
    claimTargetId(targetIds, id, `${field}.id`);
    const name = readNonBlankString(record.name, `${field}.name`);
    if (name !== name.trim()) {
      fail(`${field}.name`, "must not include surrounding whitespace");
    }
    return {
      id,
      name,
      authoredExpression: readText(
        record.authoredExpression,
        `${field}.authoredExpression`,
        true,
      ),
      parameters: parseParameters(record.parameters, field, targetIds),
    };
  });
}

function parseParameters(
  value: unknown,
  callableField: string,
  targetIds: Set<string>,
): ParameterV2[] {
  const context: ParameterParseContext = {
    callableField,
    names: new Set<string>(),
    providerOrdinals: new Set<number>(),
    targetIds,
  };
  return readArray(value, `${callableField}.parameters`, (entry, index) =>
    parseParameter(entry, index, context),
  );
}

type ParameterParseContext = {
  callableField: string;
  names: Set<string>;
  providerOrdinals: Set<number>;
  targetIds: Set<string>;
};

type ParsedParameterMetadata = Pick<
  ParameterV2,
  | "default"
  | "nameEditable"
  | "passingStyle"
  | "providerOrdinal"
  | "typeAnnotation"
>;

function parseParameter(
  entry: unknown,
  index: number,
  context: ParameterParseContext,
): ParameterV2 {
  const field = `${context.callableField}.parameters[${String(index)}]`;
  const record = readClosedRecord(entry, field, [
    "id",
    "name",
    "nameEditable",
    "passingStyle",
    "typeAnnotation",
    "default",
    "providerOrdinal",
    "authoredExpression",
  ]);
  const id = readString(record.id, `${field}.id`);
  claimTargetId(context.targetIds, id, `${field}.id`);
  const name = readText(record.name, `${field}.name`, true);
  claimParameterName(context.names, name, field);
  const metadata = parseParameterMetadata(record, field);
  validateParameterMetadata(field, name, metadata, context.providerOrdinals);
  return {
    id,
    name,
    ...metadata,
    authoredExpression: readText(
      record.authoredExpression,
      `${field}.authoredExpression`,
      true,
    ),
  };
}

function claimParameterName(
  names: Set<string>,
  name: string,
  field: string,
): void {
  if (name !== name.trim()) {
    fail(`${field}.name`, "must not include surrounding whitespace");
  }
  if (name === "") {
    return;
  }
  if (names.has(name)) {
    fail(`${field}.name`, "must be unique within its callable");
  }
  names.add(name);
}

function parseParameterMetadata(
  record: Record<string, unknown>,
  field: string,
): ParsedParameterMetadata {
  return {
    default: readTextOrNull(record.default, `${field}.default`),
    nameEditable: readBoolean(record.nameEditable, `${field}.nameEditable`),
    passingStyle: parsePassingStyle(
      record.passingStyle,
      `${field}.passingStyle`,
    ),
    providerOrdinal: readNonNegativeIntegerOrNull(
      record.providerOrdinal,
      `${field}.providerOrdinal`,
    ),
    typeAnnotation: readTextOrNull(
      record.typeAnnotation,
      `${field}.typeAnnotation`,
    ),
  };
}

function validateParameterMetadata(
  field: string,
  name: string,
  metadata: ParsedParameterMetadata,
  providerOrdinals: Set<number>,
): void {
  if (metadata.nameEditable) {
    if (!isCoherentAppAuthoredMetadata(metadata)) {
      fail(field, "has incoherent app-authored metadata");
    }
    return;
  }
  if (!isCoherentProviderMetadata(name, metadata)) {
    fail(field, "has incoherent provider-derived metadata");
  }
  claimProviderOrdinal(providerOrdinals, metadata.providerOrdinal, field);
}

function isCoherentAppAuthoredMetadata(
  metadata: ParsedParameterMetadata,
): boolean {
  return [
    metadata.passingStyle === PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
    metadata.typeAnnotation === null,
    metadata.default === null,
    metadata.providerOrdinal === null,
  ].every(Boolean);
}

function isCoherentProviderMetadata(
  name: string,
  metadata: ParsedParameterMetadata,
): boolean {
  return [name !== "", metadata.providerOrdinal !== null].every(Boolean);
}

function claimProviderOrdinal(
  providerOrdinals: Set<number>,
  providerOrdinal: number | null,
  field: string,
): void {
  if (providerOrdinal === null) {
    return;
  }
  if (providerOrdinals.has(providerOrdinal)) {
    fail(`${field}.providerOrdinal`, "must be unique within its callable");
  }
  providerOrdinals.add(providerOrdinal);
}

function parseGeneratedCode(
  value: unknown,
  target: PythonTargetV2,
  targetIds: ReadonlySet<string>,
): GeneratedCodeV2 {
  const record = readClosedRecord(value, "generatedCode", [
    "code",
    "body",
    "generatedBodyRange",
    "sourceRangesByTargetId",
  ]);
  const code = readNonBlankString(record.code, "generatedCode.code");
  const body = readNonBlankString(record.body, "generatedCode.body");
  const generatedBodyRange = parseByteRange(
    record.generatedBodyRange,
    "generatedCode.generatedBodyRange",
    code,
  );
  const sourceRangesByTargetId = parseSourceRanges(
    record.sourceRangesByTargetId,
    code,
    targetIds,
  );
  const expectedCode = `${target.prefix}\n\n${body}\n\n${target.suffix}`;
  if (code !== expectedCode) {
    fail(
      "generatedCode.code",
      "does not compose the target and generated body",
    );
  }
  const expectedStart = utf8ByteLength(target.prefix) + 2;
  const expectedEnd = expectedStart + utf8ByteLength(body);
  if (
    generatedBodyRange.start !== expectedStart ||
    generatedBodyRange.end !== expectedEnd ||
    sliceByByteRange(code, generatedBodyRange) !== body
  ) {
    fail(
      "generatedCode.generatedBodyRange",
      "does not match the generated body",
    );
  }
  return { code, body, generatedBodyRange, sourceRangesByTargetId };
}

function parseSourceRanges(
  value: unknown,
  code: string,
  targetIds: ReadonlySet<string>,
): Record<string, ByteRangeV2> {
  const record = readPlainRecord(value, "generatedCode.sourceRangesByTargetId");
  const result: Record<string, ByteRangeV2> = {};
  for (const [targetId, range] of Object.entries(record)) {
    requireStableId("generatedCode.sourceRangesByTargetId key", targetId);
    if (!targetIds.has(targetId)) {
      fail(
        "generatedCode.sourceRangesByTargetId",
        "references an unknown target",
      );
    }
    result[targetId] = parseByteRange(
      range,
      `generatedCode.sourceRangesByTargetId.${targetId}`,
      code,
    );
  }
  return result;
}

function parseDiagnostics(
  value: unknown,
  code: string,
  targetIds: ReadonlySet<string>,
): DiagnosticV2[] {
  const ids = new Set<string>();
  return readArray(value, "diagnostics", (entry, index) => {
    const field = `diagnostics[${String(index)}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "severity",
      "message",
      "start",
      "end",
      "targetId",
    ]);
    const id = readString(record.id, `${field}.id`);
    requireStableId(`${field}.id`, id);
    if (ids.has(id)) {
      fail(`${field}.id`, "must be unique");
    }
    ids.add(id);
    const byteRange = parseByteRange(
      { start: record.start, end: record.end },
      field,
      code,
    );
    const targetId = readStableIdOrNull(record.targetId, `${field}.targetId`);
    if (targetId !== null && !targetIds.has(targetId)) {
      fail(`${field}.targetId`, "references an unknown target");
    }
    return {
      id,
      severity: parseDiagnosticSeverity(record.severity, `${field}.severity`),
      message: readNonBlankString(record.message, `${field}.message`),
      start: byteRange.start,
      end: byteRange.end,
      targetId,
    };
  });
}

function parseProviderStatus(value: unknown): ProviderStatusV2 {
  const record = readClosedRecord(value, "providerStatus", [
    "provider",
    "status",
    "state",
  ]);
  if (record.provider !== PROVIDER_BASEDPYRIGHT_V2) {
    fail("providerStatus.provider", "is not supported");
  }
  const status = parseProviderAvailability(record.status);
  const state = parseProviderLifecycleState(record.state);
  const unavailable =
    state === PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2 ||
    state === PROVIDER_LIFECYCLE_STATE_FAILED_V2;
  if (
    (unavailable && status !== PROVIDER_AVAILABILITY_UNAVAILABLE_V2) ||
    (!unavailable && status !== PROVIDER_AVAILABILITY_AVAILABLE_V2)
  ) {
    fail("providerStatus", "has an invalid availability/lifecycle combination");
  }
  return { provider: PROVIDER_BASEDPYRIGHT_V2, status, state };
}

function parseCompletionItem(value: unknown, index: number): CompletionItemV2 {
  const field = `completion response.items[${String(index)}]`;
  const record = readClosedRecord(value, field, ["label", "insertText"]);
  return {
    label: readNonBlankString(record.label, `${field}.label`),
    insertText: readNonBlankString(record.insertText, `${field}.insertText`),
  };
}

function parseByteRange(
  value: unknown,
  field: string,
  code: string,
): ByteRangeV2 {
  const record = readClosedRecord(value, field, ["start", "end"]);
  const start = readNonNegativeInteger(record.start, `${field}.start`);
  const end = readNonNegativeInteger(record.end, `${field}.end`);
  if (
    end < start ||
    end > utf8ByteLength(code) ||
    !isUtf8Boundary(code, start) ||
    !isUtf8Boundary(code, end)
  ) {
    fail(field, "must be a UTF-8 byte range in generated code");
  }
  return { start, end };
}

function parsePassingStyle(
  value: unknown,
  field: string,
): ParameterPassingStyleV2 {
  switch (readString(value, field)) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2:
      return PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2;
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2:
      return PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2;
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2:
      return PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2;
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2:
      return PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2;
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2:
      return PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2;
    default:
      fail(field, "is not supported");
  }
}

function parseDiagnosticSeverity(
  value: unknown,
  field: string,
): DiagnosticSeverityV2 {
  switch (readString(value, field)) {
    case DIAGNOSTIC_SEVERITY_ERROR_V2:
      return DIAGNOSTIC_SEVERITY_ERROR_V2;
    case DIAGNOSTIC_SEVERITY_WARNING_V2:
      return DIAGNOSTIC_SEVERITY_WARNING_V2;
    case DIAGNOSTIC_SEVERITY_INFORMATION_V2:
      return DIAGNOSTIC_SEVERITY_INFORMATION_V2;
    default:
      fail(field, "is not supported");
  }
}

function parseProviderAvailability(value: unknown): ProviderAvailabilityV2 {
  switch (readString(value, "providerStatus.status")) {
    case PROVIDER_AVAILABILITY_AVAILABLE_V2:
      return PROVIDER_AVAILABILITY_AVAILABLE_V2;
    case PROVIDER_AVAILABILITY_UNAVAILABLE_V2:
      return PROVIDER_AVAILABILITY_UNAVAILABLE_V2;
    default:
      fail("providerStatus.status", "is not supported");
  }
}

function parseProviderLifecycleState(value: unknown): ProviderLifecycleStateV2 {
  switch (readString(value, "providerStatus.state")) {
    case PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2:
      return PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2;
    case PROVIDER_LIFECYCLE_STATE_PENDING_V2:
      return PROVIDER_LIFECYCLE_STATE_PENDING_V2;
    case PROVIDER_LIFECYCLE_STATE_READY_V2:
      return PROVIDER_LIFECYCLE_STATE_READY_V2;
    case PROVIDER_LIFECYCLE_STATE_FAILED_V2:
      return PROVIDER_LIFECYCLE_STATE_FAILED_V2;
    default:
      fail("providerStatus.state", "is not supported");
  }
}

const apiErrorCodes: ReadonlySet<APIErrorCodeV2> = new Set([
  "revision_conflict",
  "validation_failed",
  "not_found",
  "invalid_request",
  "provider_unavailable",
  "provider_failed",
  "render_failed",
  "materialization_failed",
  "persistence_failed",
  "method_not_allowed",
  "internal",
]);

function parseApiErrorCode(value: unknown): APIErrorCodeV2 {
  const code = readString(value, "error response.error.code");
  if (!apiErrorCodes.has(code as APIErrorCodeV2)) {
    fail("error response.error.code", "is not supported");
  }
  return code as APIErrorCodeV2;
}

function claimTargetId(ids: Set<string>, value: string, field: string): void {
  requireStableId(field, value);
  if (ids.has(value)) {
    fail(field, "must be unique");
  }
  ids.add(value);
}

function requireStableId(field: string, value: string): void {
  if (value.trim() === "" || value !== value.trim() || value.includes("\0")) {
    fail(field, "must be a nonblank stable ID");
  }
}

function readStableIdOrNull(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  const id = readString(value, field);
  requireStableId(field, id);
  return id;
}

function readText(value: unknown, field: string, allowEmpty: boolean): string {
  const text = readString(value, field);
  if ((!allowEmpty && text === "") || text.includes("\0")) {
    fail(field, "is invalid");
  }
  return text;
}

function readTextOrNull(value: unknown, field: string): string | null {
  return value === null ? null : readText(value, field, true);
}

function readNonBlankString(value: unknown, field: string): string {
  const text = readText(value, field, false);
  if (text.trim() === "") {
    fail(field, "must not be empty");
  }
  return text;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    fail(field, "must be a string");
  }
  return value;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    fail(field, "must be a boolean");
  }
  return value;
}

function readPositiveInteger(value: unknown, field: string): number {
  const result = readNonNegativeInteger(value, field);
  if (result < 1) {
    fail(field, "must be positive");
  }
  return result;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(field, "must be a nonnegative safe integer");
  }
  return value;
}

function readNonNegativeIntegerOrNull(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : readNonNegativeInteger(value, field);
}

function readArray<T>(
  value: unknown,
  field: string,
  parseEntry: (entry: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value)) {
    fail(field, "must be an array");
  }
  return value.map(parseEntry);
}

function readClosedRecord(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  const record = readPlainRecord(value, field);
  requireExactEnumerableKeys(record, keys, field);
  return record;
}

function readPlainRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(field, "must be an object");
  }
  return value as Record<string, unknown>;
}

function requireExactEnumerableKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const names = Object.getOwnPropertyNames(record);
  if (
    Object.getOwnPropertySymbols(record).length !== 0 ||
    names.length !== keys.length ||
    keys.some(
      (key) =>
        !names.includes(key) ||
        !Object.prototype.propertyIsEnumerable.call(record, key),
    )
  ) {
    fail(field, "must contain exactly the V2 fields");
  }
}

function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}

function isUtf8Boundary(value: string, byteOffset: number): boolean {
  if (byteOffset < 0 || byteOffset > utf8ByteLength(value)) {
    return false;
  }
  let offset = 0;
  if (offset === byteOffset) {
    return true;
  }
  for (const character of value) {
    offset += utf8ByteLength(character);
    if (offset === byteOffset) {
      return true;
    }
    if (offset > byteOffset) {
      return false;
    }
  }
  return false;
}

function sliceByByteRange(value: string, range: ByteRangeV2): string {
  let utf8Offset = 0;
  let start = -1;
  let end = -1;
  let utf16Offset = 0;
  for (const character of value) {
    if (utf8Offset === range.start) {
      start = utf16Offset;
    }
    if (utf8Offset === range.end) {
      end = utf16Offset;
    }
    utf8Offset += utf8ByteLength(character);
    utf16Offset += character.length;
  }
  if (utf8Offset === range.start) {
    start = utf16Offset;
  }
  if (utf8Offset === range.end) {
    end = utf16Offset;
  }
  if (start < 0 || end < start) {
    fail("generatedCode.generatedBodyRange", "is not a UTF-8 boundary");
  }
  return value.slice(start, end);
}

function fail(field: string, problem: string): never {
  throw new ProjectSnapshotValidationError(field, problem);
}
