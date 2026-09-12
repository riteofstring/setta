package contracts

func TypeScriptContract() string {
	return `export interface StructuredErrorV1 {
  code: string;
  message: string;
}

interface CommandV1 {
  argv: string[];
  workingDirectory: string;
}

interface CandidateOriginV1 {
  application: "python-canvas";
  projectId: string;
  projectRevision: number;
  callableId: string;
  deepLink: string;
}

export interface CandidateV1 {
  id: string;
  name: string;
  command: CommandV1;
  origin: CandidateOriginV1 | null;
}

interface CaseSetV1 {
  id: string;
  name: string;
  manifest: string;
}

type CheckKindV1 = "artifact_max_bytes" | "image_dimensions";

export interface CheckV1 {
  id: string;
  name: string;
  kind: CheckKindV1;
  artifactName: string;
  maximumBytes: number | null;
  width: number | null;
  height: number | null;
}

interface EvaluatorV1 {
  id: string;
  name: string;
  checks: CheckV1[];
}

interface ExecutionPolicyV1 {
  concurrency: number;
  timeoutMilliseconds: number;
}

interface SectionLayoutV1 {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface ViewportV1 {
  x: number;
  y: number;
  zoom: number;
}

interface PresentationV1 {
  sections: Record<string, SectionLayoutV1>;
  viewport: ViewportV1;
}

export interface ProjectV1 {
  version: 1;
  id: string;
  revision: number;
  name: string;
  caseSet: CaseSetV1;
  candidates: CandidateV1[];
  evaluator: EvaluatorV1 | null;
  execution: ExecutionPolicyV1;
  presentation: PresentationV1;
}

export interface ProjectDraftV1 {
  name: string;
  caseSet: CaseSetV1;
  candidates: CandidateV1[];
  evaluator: EvaluatorV1 | null;
  execution: ExecutionPolicyV1;
  presentation: PresentationV1;
}

export interface ReplaceProjectRequestV1 {
  projectId: string;
  expectedRevision: number;
  project: ProjectDraftV1;
}

export interface ImportCandidateRequestV1 {
  projectId: string;
  expectedRevision: number;
  bundleDirectory: string;
}

interface CaseV1 {
  id: string;
  name: string;
  input: unknown;
  expected: unknown | null;
}

export interface LaunchRequestV1 {
  projectId: string;
  expectedRevision: number;
  candidateIds: string[];
}

interface LaunchResponseV1 {
  launchId: string;
  runIds: string[];
}

interface LaunchV1 {
  version: 1;
  id: string;
  projectId: string;
  projectRevision: number;
  createdAt: string;
  caseSet: CaseSetV1;
  cases: CaseV1[];
  candidates: CandidateV1[];
  evaluator: EvaluatorV1 | null;
  execution: ExecutionPolicyV1;
  runIds: string[];
  rerunParentRunId: string | null;
}

export interface ArtifactReferenceV1 {
  id: string;
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
}

type ObservationKindV1 = "number" | "text" | "boolean";

export interface ObservationV1 {
  id: string;
  name: string;
  kind: ObservationKindV1;
  numberValue: number | null;
  textValue: string | null;
  booleanValue: boolean | null;
}

type FindingStatusV1 = "passed" | "failed";

export interface FindingV1 {
  checkId: string;
  checkName: string;
  status: FindingStatusV1;
  message: string;
}

type CaseStatusV1 = "queued" | "running" | "succeeded" | "failed" | "canceled" | "timed_out" | "interrupted";

export interface CaseResultV1 {
  caseId: string;
  caseName: string;
  status: CaseStatusV1;
  progress: number;
  message: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMilliseconds: number | null;
  output: unknown | null;
  observations: ObservationV1[];
  findings: FindingV1[];
  artifacts: ArtifactReferenceV1[];
  stderr: string;
  stderrTruncated: boolean;
  error: StructuredErrorV1 | null;
}

type RunStatusV1 = "queued" | "running" | "completed" | "failed" | "canceled" | "interrupted";

export interface RunV1 {
  version: 1;
  id: string;
  launchId: string;
  candidateId: string;
  candidateName: string;
  status: RunStatusV1;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  caseResults: CaseResultV1[];
  rerunParentId: string | null;
  error: StructuredErrorV1 | null;
}

export interface ReviewV1 {
  version: 1;
  leftRunId: string;
  rightRunId: string;
  preferredRunId: string | null;
  note: string;
  updatedAt: string;
}

export interface PutReviewRequestV1 {
  leftRunId: string;
  rightRunId: string;
  preferredRunId: string | null;
  note: string;
}

interface ValidationIssueV1 {
  code: string;
  message: string;
  path: string;
}

interface ProjectValidationV1 {
  ready: boolean;
  caseCount: number;
  executionCount: number;
  issues: ValidationIssueV1[];
}

export interface ApplicationSnapshotV1 {
  version: "bench-snapshot/v1";
  project: ProjectV1;
  validation: ProjectValidationV1;
  launches: LaunchV1[];
  runs: RunV1[];
  reviews: ReviewV1[];
  diagnostics: StructuredErrorV1[];
}
`
}

func ProjectSchema() map[string]any {
	definitions := schemaDefinitions()
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.dev/schemas/bench/project-v1",
		"$ref":    "#/$defs/project",
		"$defs":   definitions,
	}
}

func SnapshotSchema() map[string]any {
	definitions := schemaDefinitions()
	return map[string]any{
		"$schema":              "https://json-schema.org/draft/2020-12/schema",
		"$id":                  "https://setta.dev/schemas/bench/snapshot-v1",
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"version", "project", "validation", "launches", "runs", "reviews", "diagnostics"},
		"properties": map[string]any{
			"version":     map[string]any{"const": SnapshotVersion},
			"project":     ref("project"),
			"validation":  ref("projectValidation"),
			"launches":    array(ref("launch"), 0, -1),
			"runs":        array(ref("run"), 0, -1),
			"reviews":     array(ref("review"), 0, -1),
			"diagnostics": array(ref("structuredError"), 0, -1),
		},
		"$defs": definitions,
	}
}

func ProtocolSchema() map[string]any {
	definitions := schemaDefinitions()
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.dev/schemas/bench/protocol-v1",
		"oneOf":   []any{ref("candidateRequest"), ref("candidateProgress"), ref("candidateResult"), ref("candidateError")},
		"$defs":   definitions,
	}
}

func schemaDefinitions() map[string]any {
	id := map[string]any{"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"}
	nullableString := nullable(map[string]any{"type": "string"})
	nullableInteger := nullable(map[string]any{"type": "integer"})
	nullableNumber := nullable(map[string]any{"type": "number"})
	nullableBoolean := nullable(map[string]any{"type": "boolean"})
	return map[string]any{
		"structuredError":   object([]string{"code", "message"}, map[string]any{"code": id, "message": text(1, 4096)}),
		"command":           object([]string{"argv", "workingDirectory"}, map[string]any{"argv": array(text(1, 4096), 1, 32), "workingDirectory": text(1, 4096)}),
		"origin":            object([]string{"application", "projectId", "projectRevision", "callableId", "deepLink"}, map[string]any{"application": map[string]any{"const": "python-canvas"}, "projectId": text(1, 256), "projectRevision": integer(1, -1), "callableId": text(1, 256), "deepLink": map[string]any{"type": "string", "minLength": 1, "maxLength": 4096, "pattern": "^[Hh][Tt][Tt][Pp][Ss]?://"}}),
		"candidate":         object([]string{"id", "name", "command", "origin"}, map[string]any{"id": id, "name": text(1, 256), "command": ref("command"), "origin": nullable(ref("origin"))}),
		"caseSet":           object([]string{"id", "name", "manifest"}, map[string]any{"id": id, "name": text(1, 256), "manifest": text(1, 4096)}),
		"check":             object([]string{"id", "name", "kind", "artifactName", "maximumBytes", "width", "height"}, map[string]any{"id": id, "name": text(1, 256), "kind": enum("artifact_max_bytes", "image_dimensions"), "artifactName": text(1, 128), "maximumBytes": nullableInteger, "width": nullableInteger, "height": nullableInteger}),
		"evaluator":         object([]string{"id", "name", "checks"}, map[string]any{"id": id, "name": text(1, 256), "checks": array(ref("check"), 0, MaximumChecks)}),
		"execution":         object([]string{"concurrency", "timeoutMilliseconds"}, map[string]any{"concurrency": integer(1, 8), "timeoutMilliseconds": integer(100, 300000)}),
		"sectionLayout":     object([]string{"x", "y", "width", "height", "zIndex"}, map[string]any{"x": map[string]any{"type": "number"}, "y": map[string]any{"type": "number"}, "width": number(160, 4096), "height": number(96, 4096), "zIndex": integer(0, -1)}),
		"viewport":          object([]string{"x", "y", "zoom"}, map[string]any{"x": map[string]any{"type": "number"}, "y": map[string]any{"type": "number"}, "zoom": number(0.1, 4)}),
		"presentation":      object([]string{"sections", "viewport"}, map[string]any{"sections": map[string]any{"type": "object", "propertyNames": id, "additionalProperties": ref("sectionLayout")}, "viewport": ref("viewport")}),
		"project":           object([]string{"version", "id", "revision", "name", "caseSet", "candidates", "evaluator", "execution", "presentation"}, map[string]any{"version": map[string]any{"const": ProjectVersion}, "id": id, "revision": integer(0, -1), "name": text(1, 256), "caseSet": ref("caseSet"), "candidates": array(ref("candidate"), 2, MaximumCandidates), "evaluator": nullable(ref("evaluator")), "execution": ref("execution"), "presentation": ref("presentation")}),
		"case":              object([]string{"id", "name", "input", "expected"}, map[string]any{"id": id, "name": text(1, 256), "input": true, "expected": true}),
		"artifactReference": object([]string{"id", "name", "mediaType", "byteLength", "sha256"}, map[string]any{"id": id, "name": text(1, 128), "mediaType": text(1, 256), "byteLength": integer(0, int(MaximumArtifactBytes)), "sha256": map[string]any{"type": "string", "pattern": "^[0-9a-fA-F]{64}$"}}),
		"observation":       object([]string{"id", "name", "kind", "numberValue", "textValue", "booleanValue"}, map[string]any{"id": id, "name": text(1, 256), "kind": enum("number", "text", "boolean"), "numberValue": nullableNumber, "textValue": nullableString, "booleanValue": nullableBoolean}),
		"finding":           object([]string{"checkId", "checkName", "status", "message"}, map[string]any{"checkId": id, "checkName": text(1, 256), "status": enum("passed", "failed"), "message": text(1, 4096)}),
		"caseResult":        object([]string{"caseId", "caseName", "status", "progress", "message", "startedAt", "completedAt", "durationMilliseconds", "output", "observations", "findings", "artifacts", "stderr", "stderrTruncated", "error"}, map[string]any{"caseId": id, "caseName": text(1, 256), "status": enum("queued", "running", "succeeded", "failed", "canceled", "timed_out", "interrupted"), "progress": number(0, 1), "message": text(0, 4096), "startedAt": nullableString, "completedAt": nullableString, "durationMilliseconds": nullableInteger, "output": true, "observations": array(ref("observation"), 0, MaximumObservations+1), "findings": array(ref("finding"), 0, MaximumChecks), "artifacts": array(ref("artifactReference"), 0, MaximumArtifacts), "stderr": text(0, MaximumTextBytes), "stderrTruncated": map[string]any{"type": "boolean"}, "error": nullable(ref("structuredError"))}),
		"run":               object([]string{"version", "id", "launchId", "candidateId", "candidateName", "status", "createdAt", "startedAt", "completedAt", "caseResults", "rerunParentId", "error"}, map[string]any{"version": map[string]any{"const": RunRecordVersion}, "id": id, "launchId": id, "candidateId": id, "candidateName": text(1, 256), "status": enum("queued", "running", "completed", "failed", "canceled", "interrupted"), "createdAt": text(1, 128), "startedAt": nullableString, "completedAt": nullableString, "caseResults": array(ref("caseResult"), 1, MaximumCases), "rerunParentId": nullableString, "error": nullable(ref("structuredError"))}),
		"launch":            object([]string{"version", "id", "projectId", "projectRevision", "createdAt", "caseSet", "cases", "candidates", "evaluator", "execution", "runIds", "rerunParentRunId"}, map[string]any{"version": map[string]any{"const": RunRecordVersion}, "id": id, "projectId": id, "projectRevision": integer(0, -1), "createdAt": text(1, 128), "caseSet": ref("caseSet"), "cases": array(ref("case"), 1, MaximumCases), "candidates": array(ref("candidate"), 1, MaximumCandidates), "evaluator": nullable(ref("evaluator")), "execution": ref("execution"), "runIds": array(id, 1, MaximumCandidates), "rerunParentRunId": nullableString}),
		"review":            object([]string{"version", "leftRunId", "rightRunId", "preferredRunId", "note", "updatedAt"}, map[string]any{"version": map[string]any{"const": ReviewVersion}, "leftRunId": id, "rightRunId": id, "preferredRunId": nullableString, "note": text(0, 4096), "updatedAt": text(1, 128)}),
		"validationIssue":   object([]string{"code", "message", "path"}, map[string]any{"code": id, "message": text(1, 4096), "path": text(1, 1024)}),
		"projectValidation": object([]string{"ready", "caseCount", "executionCount", "issues"}, map[string]any{"ready": map[string]any{"type": "boolean"}, "caseCount": integer(0, MaximumCases), "executionCount": integer(0, MaximumCases*MaximumCandidates), "issues": array(ref("validationIssue"), 0, MaximumCandidates+1)}),
		"candidateRequest":  object([]string{"protocolVersion", "runId", "case", "outputDirectory"}, map[string]any{"protocolVersion": map[string]any{"const": CandidateProtocolVersion}, "runId": id, "case": ref("case"), "outputDirectory": text(1, 4096)}),
		"candidateArtifact": object([]string{"name", "mediaType", "path"}, map[string]any{"name": text(1, 128), "mediaType": text(1, 256), "path": text(1, 4096)}),
		"candidateProgress": object([]string{"type", "progress", "message"}, map[string]any{"type": map[string]any{"const": "progress"}, "progress": number(0, 1), "message": text(0, 4096)}),
		"candidateResult":   object([]string{"type", "output", "observations", "artifacts"}, map[string]any{"type": map[string]any{"const": "result"}, "output": true, "observations": array(ref("observation"), 0, MaximumObservations-1), "artifacts": array(ref("candidateArtifact"), 0, MaximumArtifacts)}),
		"candidateError":    object([]string{"type", "code", "message"}, map[string]any{"type": map[string]any{"const": "error"}, "code": id, "message": text(1, 4096)}),
	}
}

func object(required []string, properties map[string]any) map[string]any {
	return map[string]any{"type": "object", "additionalProperties": false, "required": required, "properties": properties}
}

func array(items any, minimum int, maximum int) map[string]any {
	value := map[string]any{"type": "array", "items": items, "minItems": minimum}
	if maximum >= 0 {
		value["maxItems"] = maximum
	}
	return value
}

func text(minimum int, maximum int) map[string]any {
	return map[string]any{"type": "string", "minLength": minimum, "maxLength": maximum}
}

func integer(minimum int, maximum int) map[string]any {
	value := map[string]any{"type": "integer", "minimum": minimum}
	if maximum >= 0 {
		value["maximum"] = maximum
	}
	return value
}

func number(minimum float64, maximum float64) map[string]any {
	return map[string]any{"type": "number", "minimum": minimum, "maximum": maximum}
}

func nullable(value map[string]any) map[string]any {
	return map[string]any{"anyOf": []any{value, map[string]any{"type": "null"}}}
}

func enum(values ...string) map[string]any {
	return map[string]any{"type": "string", "enum": values}
}

func ref(name string) map[string]any {
	return map[string]any{"$ref": "#/$defs/" + name}
}
