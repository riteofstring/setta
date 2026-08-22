import {
  DIAGNOSTIC_SEVERITY_ERROR_V1,
  DIAGNOSTIC_SEVERITY_INFORMATION_V1,
  DIAGNOSTIC_SEVERITY_WARNING_V1,
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1,
  PROJECT_SNAPSHOT_VERSION_V1,
  PROVIDER_AVAILABILITY_AVAILABLE_V1,
  PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
  PROVIDER_BASEDPYRIGHT_V1,
  PROVIDER_LIFECYCLE_STATE_FAILED_V1,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
  PROVIDER_LIFECYCLE_STATE_PENDING_V1,
  PROVIDER_LIFECYCLE_STATE_READY_V1,
  type CallableV1,
  type CallableCompletionItemV1,
  type CallableCompletionResponseV1,
  type APIErrorCodeV1,
  type DiagnosticSeverityV1,
  type DiagnosticV1,
  type ErrorResponseV1,
  type GeneratedCodeV1,
  type GeneratedSourceRangeV1,
  type ParameterPassingStyleV1,
  type ParameterV1,
  type ProjectSnapshotV1,
  type ProjectV1,
  type ProviderStatusV1,
  type PythonTargetV1,
} from "./generatedContract";

export class ProjectSnapshotValidationError extends Error {
  public readonly name = "ProjectSnapshotValidationError";

  public constructor(
    public readonly field: string,
    problem: string,
  ) {
    super(`Invalid ProjectSnapshotV1 ${field}: ${problem}.`);
  }
}

export function parseProjectSnapshotV1(value: unknown): ProjectSnapshotV1 {
  const record = readClosedRecord(value, "snapshot", [
    "version",
    "project",
    "pythonTarget",
    "callables",
    "parameters",
    "generatedCode",
    "diagnostics",
    "providerStatus",
  ]);

  const version = readString(record.version, "version");
  if (version !== PROJECT_SNAPSHOT_VERSION_V1) {
    fail("version", "is not supported by V1");
  }

  const snapshot: ProjectSnapshotV1 = {
    version,
    project: parseProject(record.project),
    pythonTarget: parsePythonTarget(record.pythonTarget),
    callables: parseCallables(record.callables),
    parameters: parseParameters(record.parameters),
    generatedCode: parseGeneratedCode(record.generatedCode),
    diagnostics: parseDiagnostics(record.diagnostics),
    providerStatus: parseProviderStatus(record.providerStatus),
  };

  validateSnapshotRelationships(snapshot);
  return snapshot;
}

export function parseErrorResponseV1(value: unknown): ErrorResponseV1 {
  const response = readClosedRecord(value, "error response", ["error"]);
  const error = readClosedRecord(response.error, "error response.error", [
    "code",
    "message",
  ]);
  return {
    error: {
      code: parseApiErrorCode(error.code),
      message: readNonBlankString(
        error.message,
        "error response.error.message",
      ),
    },
  };
}

export function parseCallableCompletionResponseV1(
  value: unknown,
): CallableCompletionResponseV1 {
  const response = readClosedRecord(value, "callable completion response", [
    "items",
  ]);
  return {
    items: readArray(
      response.items,
      "callable completion response.items",
      parseCallableCompletionItem,
    ),
  };
}

function parseCallableCompletionItem(
  value: unknown,
  index: number,
): CallableCompletionItemV1 {
  const field = `callable completion response.items[${index}]`;
  const record = readClosedRecord(value, field, ["label", "insertText"]);
  return {
    label: readNonBlankString(record.label, `${field}.label`),
    insertText: readNonBlankString(record.insertText, `${field}.insertText`),
  };
}

function parseProject(value: unknown): ProjectV1 {
  const record = readClosedRecord(value, "project", ["id", "revision"]);
  return {
    id: readString(record.id, "project.id"),
    revision: readInteger(record.revision, "project.revision"),
  };
}

function parsePythonTarget(value: unknown): PythonTargetV1 {
  const record = readClosedRecord(value, "pythonTarget", ["prefix", "suffix"]);
  return {
    prefix: readString(record.prefix, "pythonTarget.prefix"),
    suffix: readString(record.suffix, "pythonTarget.suffix"),
  };
}

function parseCallables(value: unknown): [CallableV1] {
  const callables = readArray(value, "callables", (entry, index) => {
    const field = `callables[${index}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "name",
      "authoredExpression",
      "parameterIds",
    ]);
    return {
      id: readString(record.id, `${field}.id`),
      name: readString(record.name, `${field}.name`),
      authoredExpression: readString(
        record.authoredExpression,
        `${field}.authoredExpression`,
      ),
      parameterIds: readArray(
        record.parameterIds,
        `${field}.parameterIds`,
        (parameterId, parameterIndex) =>
          readString(parameterId, `${field}.parameterIds[${parameterIndex}]`),
      ),
    };
  });
  const callable = callables[0];
  if (callables.length !== 1 || callable === undefined) {
    fail("callables", "must contain exactly one callable");
  }
  return [callable];
}

function parseParameters(value: unknown): ParameterV1[] {
  return readArray(value, "parameters", (entry, index) => {
    const field = `parameters[${index}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "name",
      "nameEditable",
      "passingStyle",
      "typeAnnotation",
      "default",
      "authoredExpression",
    ]);
    return {
      id: readString(record.id, `${field}.id`),
      name: readString(record.name, `${field}.name`),
      nameEditable: readBoolean(record.nameEditable, `${field}.nameEditable`),
      passingStyle: parsePassingStyle(
        record.passingStyle,
        `${field}.passingStyle`,
      ),
      typeAnnotation: readString(
        record.typeAnnotation,
        `${field}.typeAnnotation`,
      ),
      default: readStringOrNull(record.default, `${field}.default`),
      authoredExpression: readString(
        record.authoredExpression,
        `${field}.authoredExpression`,
      ),
    };
  });
}

function parseGeneratedCode(value: unknown): GeneratedCodeV1 {
  const record = readClosedRecord(value, "generatedCode", [
    "code",
    "body",
    "sourceRanges",
  ]);
  return {
    code: readString(record.code, "generatedCode.code"),
    body: readString(record.body, "generatedCode.body"),
    sourceRanges: readArray(
      record.sourceRanges,
      "generatedCode.sourceRanges",
      parseSourceRange,
    ),
  };
}

function parseSourceRange(
  value: unknown,
  index: number,
): GeneratedSourceRangeV1 {
  const field = `generatedCode.sourceRanges[${index}]`;
  const record = readClosedRecord(value, field, ["targetId", "start", "end"]);
  return {
    targetId: readString(record.targetId, `${field}.targetId`),
    start: readInteger(record.start, `${field}.start`),
    end: readInteger(record.end, `${field}.end`),
  };
}

function parseDiagnostics(value: unknown): DiagnosticV1[] {
  return readArray(value, "diagnostics", (entry, index) => {
    const field = `diagnostics[${index}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "severity",
      "message",
      "targetId",
    ]);
    return {
      id: readString(record.id, `${field}.id`),
      severity: parseDiagnosticSeverity(record.severity, `${field}.severity`),
      message: readString(record.message, `${field}.message`),
      targetId: readString(record.targetId, `${field}.targetId`),
    };
  });
}

function parseProviderStatus(value: unknown): ProviderStatusV1 {
  const record = readClosedRecord(value, "providerStatus", [
    "provider",
    "status",
    "state",
  ]);
  const provider = readString(record.provider, "providerStatus.provider");
  const status = readString(record.status, "providerStatus.status");
  const state = readString(record.state, "providerStatus.state");

  validateProvider(provider);
  const availability = parseProviderAvailability(status);
  const lifecycleState = parseProviderLifecycleState(state);
  validateProviderStatusCombination(availability, lifecycleState);

  return {
    provider: PROVIDER_BASEDPYRIGHT_V1,
    status: availability,
    state: lifecycleState,
  };
}

function validateProvider(provider: string): void {
  if (provider !== PROVIDER_BASEDPYRIGHT_V1) {
    fail("providerStatus.provider", "is not supported by V1");
  }
}

function parseProviderAvailability(value: string): ProviderStatusV1["status"] {
  switch (value) {
    case PROVIDER_AVAILABILITY_AVAILABLE_V1:
      return PROVIDER_AVAILABILITY_AVAILABLE_V1;
    case PROVIDER_AVAILABILITY_UNAVAILABLE_V1:
      return PROVIDER_AVAILABILITY_UNAVAILABLE_V1;
    default:
      fail("providerStatus.status", "is not supported by V1");
  }
}

function parseProviderLifecycleState(value: string): ProviderStatusV1["state"] {
  switch (value) {
    case PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1:
      return PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1;
    case PROVIDER_LIFECYCLE_STATE_READY_V1:
      return PROVIDER_LIFECYCLE_STATE_READY_V1;
    case PROVIDER_LIFECYCLE_STATE_PENDING_V1:
      return PROVIDER_LIFECYCLE_STATE_PENDING_V1;
    case PROVIDER_LIFECYCLE_STATE_FAILED_V1:
      return PROVIDER_LIFECYCLE_STATE_FAILED_V1;
    default:
      fail("providerStatus.state", "is not supported by V1");
  }
}

function validateProviderStatusCombination(
  status: ProviderStatusV1["status"],
  state: ProviderStatusV1["state"],
): void {
  switch (state) {
    case PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1:
    case PROVIDER_LIFECYCLE_STATE_FAILED_V1:
      if (status !== PROVIDER_AVAILABILITY_UNAVAILABLE_V1) {
        fail(
          "providerStatus",
          "has an invalid availability/lifecycle combination",
        );
      }
      return;
    case PROVIDER_LIFECYCLE_STATE_READY_V1:
    case PROVIDER_LIFECYCLE_STATE_PENDING_V1:
      if (status !== PROVIDER_AVAILABILITY_AVAILABLE_V1) {
        fail(
          "providerStatus",
          "has an invalid availability/lifecycle combination",
        );
      }
  }
}

function parsePassingStyle(
  value: unknown,
  field: string,
): ParameterPassingStyleV1 {
  const style = readString(value, field);
  switch (style) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1:
      return PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1;
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1:
      return PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V1;
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1:
      return PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V1;
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1:
      return PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V1;
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1:
      return PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V1;
    default:
      fail(field, "is not supported by V1");
  }
}

function parseDiagnosticSeverity(
  value: unknown,
  field: string,
): DiagnosticSeverityV1 {
  const severity = readString(value, field);
  switch (severity) {
    case DIAGNOSTIC_SEVERITY_ERROR_V1:
      return DIAGNOSTIC_SEVERITY_ERROR_V1;
    case DIAGNOSTIC_SEVERITY_WARNING_V1:
      return DIAGNOSTIC_SEVERITY_WARNING_V1;
    case DIAGNOSTIC_SEVERITY_INFORMATION_V1:
      return DIAGNOSTIC_SEVERITY_INFORMATION_V1;
    default:
      fail(field, "is not supported by V1");
  }
}

// Every code the generated union carries, listed once. This reader decides membership rather than
// mapping each code to its own behavior, so the codes belong in a list rather than in branches.
const API_ERROR_CODES_V1: ReadonlyArray<APIErrorCodeV1> = [
  "invalid_request",
  "method_not_allowed",
  "not_found",
  "invalid_callable",
  "invalid_parameter_expression",
  "invalid_parameter_name",
  "invalid_python_target",
  "revision_conflict",
  "unsupported_signature",
  "provider_unavailable",
  "internal",
];

function parseApiErrorCode(value: unknown): APIErrorCodeV1 {
  const code = readString(value, "error response.error.code");
  const supported = API_ERROR_CODES_V1.find((candidate) => candidate === code);
  if (supported === undefined) {
    fail("error response.error.code", "is not supported by V1");
  }
  return supported;
}

function validateSnapshotRelationships(snapshot: ProjectSnapshotV1): void {
  validateSnapshotRoot(snapshot);

  const targetIds = new Set([snapshot.project.id]);
  const parameterIds = new Set<string>();
  validateParameters(snapshot.parameters, targetIds, parameterIds);
  validateCallables(snapshot.callables, targetIds, parameterIds);
  validateSourceRanges(
    snapshot.generatedCode.sourceRanges,
    targetIds,
    new TextEncoder().encode(snapshot.generatedCode.code).length,
  );
  validateDiagnostics(snapshot.diagnostics, targetIds);
}

function validateSnapshotRoot(snapshot: ProjectSnapshotV1): void {
  requireStableId("project.id", snapshot.project.id);
  if (snapshot.project.revision < 1) {
    fail("project.revision", "must be at least 1");
  }
  if (snapshot.pythonTarget.prefix === "") {
    fail("pythonTarget.prefix", "must not be empty");
  }
  if (snapshot.pythonTarget.suffix === "") {
    fail("pythonTarget.suffix", "must not be empty");
  }
}

function validateParameters(
  parameters: ParameterV1[],
  targetIds: Set<string>,
  parameterIds: Set<string>,
): void {
  for (const [index, parameter] of parameters.entries()) {
    const field = `parameters[${index}]`;
    requireStableId(`${field}.id`, parameter.id);
    if (targetIds.has(parameter.id)) {
      fail(`${field}.id`, "must be unique");
    }
    // An app-authored record may still be unnamed, which the backend renders as no
    // parameter at all. Surrounding whitespace is not a name anyone meant.
    if (parameter.name !== parameter.name.trim()) {
      fail(`${field}.name`, "must not include surrounding whitespace");
    }
    targetIds.add(parameter.id);
    parameterIds.add(parameter.id);
  }
}

function validateCallables(
  callables: [CallableV1],
  targetIds: Set<string>,
  parameterIds: Set<string>,
): void {
  for (const [index, callable] of callables.entries()) {
    const field = `callables[${index}]`;
    requireStableId(`${field}.id`, callable.id);
    if (targetIds.has(callable.id)) {
      fail(`${field}.id`, "must be unique");
    }
    requireNonBlank(`${field}.name`, callable.name);
    validateCallableParameterIds(field, callable.parameterIds, parameterIds);
    targetIds.add(callable.id);
  }
}

function validateCallableParameterIds(
  callableField: string,
  ids: string[],
  parameterIds: Set<string>,
): void {
  const callableParameterIds = new Set<string>();
  for (const [parameterIndex, parameterId] of ids.entries()) {
    const parameterField = `${callableField}.parameterIds[${parameterIndex}]`;
    requireStableId(parameterField, parameterId);
    if (!parameterIds.has(parameterId)) {
      fail(parameterField, "must reference a parameter");
    }
    if (callableParameterIds.has(parameterId)) {
      fail(parameterField, "must not be repeated");
    }
    callableParameterIds.add(parameterId);
  }
}

function validateSourceRanges(
  sourceRanges: GeneratedSourceRangeV1[],
  targetIds: Set<string>,
  codeLength: number,
): void {
  for (const [index, sourceRange] of sourceRanges.entries()) {
    const field = `generatedCode.sourceRanges[${index}]`;
    validateSourceRange(field, sourceRange, targetIds, codeLength);
  }
}

function validateSourceRange(
  field: string,
  sourceRange: GeneratedSourceRangeV1,
  targetIds: Set<string>,
  codeLength: number,
): void {
  if (!targetIds.has(sourceRange.targetId)) {
    fail(`${field}.targetId`, "must reference a stable target ID");
  }
  if (sourceRange.start < 0) {
    fail(`${field}.start`, "must not be negative");
  }
  if (sourceRange.end < sourceRange.start) {
    fail(`${field}.end`, "must not precede start");
  }
  if (sourceRange.end > codeLength) {
    fail(`${field}.end`, "must not exceed generated code length");
  }
}

function validateDiagnostics(
  diagnostics: DiagnosticV1[],
  targetIds: Set<string>,
): void {
  const diagnosticIds = new Set<string>();
  for (const [index, diagnostic] of diagnostics.entries()) {
    const field = `diagnostics[${index}]`;
    requireStableId(`${field}.id`, diagnostic.id);
    if (diagnosticIds.has(diagnostic.id)) {
      fail(`${field}.id`, "must be unique");
    }
    requireNonBlank(`${field}.message`, diagnostic.message);
    if (!targetIds.has(diagnostic.targetId)) {
      fail(`${field}.targetId`, "must reference a stable target ID");
    }
    diagnosticIds.add(diagnostic.id);
  }
}

function readClosedRecord(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    fail(field, "must be an object");
  }

  const record = value as Record<string, unknown>;
  if (!hasExactEnumerableKeys(record, keys)) {
    fail(field, "must contain exactly the V1 fields");
  }
  return record;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function hasExactEnumerableKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const ownNames = Object.getOwnPropertyNames(record);
  return (
    Object.getOwnPropertySymbols(record).length === 0 &&
    ownNames.length === keys.length &&
    keys.every((key) =>
      Object.prototype.propertyIsEnumerable.call(record, key),
    ) &&
    keys.every((key) => ownNames.includes(key))
  );
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

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    fail(field, "must be a string");
  }
  return value;
}

function readNonBlankString(value: unknown, field: string): string {
  const text = readString(value, field);
  if (text.trim() === "") {
    fail(field, "must not be empty");
  }
  return text;
}

function readStringOrNull(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, field);
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    fail(field, "must be a boolean");
  }
  return value;
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(field, "must be a safe integer");
  }
  return value;
}

function requireStableId(field: string, value: string): void {
  if (value.trim() === "") {
    fail(field, "must not be empty");
  }
  if (value !== value.trim()) {
    fail(field, "must not include surrounding whitespace");
  }
}

function requireNonBlank(field: string, value: string): void {
  if (value.trim() === "") {
    fail(field, "must not be empty");
  }
}

function fail(field: string, problem: string): never {
  throw new ProjectSnapshotValidationError(field, problem);
}
