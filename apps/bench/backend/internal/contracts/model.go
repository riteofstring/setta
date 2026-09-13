package contracts

import "encoding/json"

const (
	ProjectVersion           = 1
	RunRecordVersion         = 1
	ReviewVersion            = 1
	BundleVersion            = 1
	SnapshotVersion          = "bench-snapshot/v1"
	CandidateProtocolVersion = "bench-candidate/v1"
)

type StructuredErrorV1 struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type CommandV1 struct {
	Argv             []string `json:"argv"`
	WorkingDirectory string   `json:"workingDirectory"`
}

type CandidateOriginV1 struct {
	Application     string `json:"application"`
	ProjectID       string `json:"projectId"`
	ProjectRevision int    `json:"projectRevision"`
	CallableID      string `json:"callableId"`
	DeepLink        string `json:"deepLink"`
}

type CandidateV1 struct {
	ID      string             `json:"id"`
	Name    string             `json:"name"`
	Command CommandV1          `json:"command"`
	Origin  *CandidateOriginV1 `json:"origin"`
}

type CaseSetV1 struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Manifest string `json:"manifest"`
}

type CheckV1 struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Kind         string `json:"kind"`
	ArtifactName string `json:"artifactName"`
	MaximumBytes *int64 `json:"maximumBytes"`
	Width        *int   `json:"width"`
	Height       *int   `json:"height"`
}

type EvaluatorV1 struct {
	ID     string    `json:"id"`
	Name   string    `json:"name"`
	Checks []CheckV1 `json:"checks"`
}

type ExecutionPolicyV1 struct {
	Concurrency         int `json:"concurrency"`
	TimeoutMilliseconds int `json:"timeoutMilliseconds"`
}

type SectionLayoutV1 struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	ZIndex int     `json:"zIndex"`
}

type ViewportV1 struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type PresentationV1 struct {
	Sections map[string]SectionLayoutV1 `json:"sections"`
	Viewport ViewportV1                 `json:"viewport"`
}

type ProjectV1 struct {
	Version      int               `json:"version"`
	ID           string            `json:"id"`
	Revision     int               `json:"revision"`
	Name         string            `json:"name"`
	CaseSet      CaseSetV1         `json:"caseSet"`
	Candidates   []CandidateV1     `json:"candidates"`
	Evaluator    *EvaluatorV1      `json:"evaluator"`
	Execution    ExecutionPolicyV1 `json:"execution"`
	Presentation PresentationV1    `json:"presentation"`
}

type ProjectDraftV1 struct {
	Name         string            `json:"name"`
	CaseSet      CaseSetV1         `json:"caseSet"`
	Candidates   []CandidateV1     `json:"candidates"`
	Evaluator    *EvaluatorV1      `json:"evaluator"`
	Execution    ExecutionPolicyV1 `json:"execution"`
	Presentation PresentationV1    `json:"presentation"`
}

type ReplaceProjectRequestV1 struct {
	ProjectID        string         `json:"projectId"`
	ExpectedRevision int            `json:"expectedRevision"`
	Project          ProjectDraftV1 `json:"project"`
}

type ImportCandidateRequestV1 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	BundleDirectory  string `json:"bundleDirectory"`
}

type CandidateBundleV1 struct {
	Version   int               `json:"version"`
	Source    CandidateOriginV1 `json:"source"`
	Candidate CandidateV1       `json:"candidate"`
}

type CaseV1 struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Input    json.RawMessage `json:"input"`
	Expected json.RawMessage `json:"expected"`
}

type LaunchRequestV1 struct {
	ProjectID        string   `json:"projectId"`
	ExpectedRevision int      `json:"expectedRevision"`
	CandidateIDs     []string `json:"candidateIds"`
}

type LaunchResponseV1 struct {
	LaunchID string   `json:"launchId"`
	RunIDs   []string `json:"runIds"`
}

type LaunchV1 struct {
	Version          int               `json:"version"`
	ID               string            `json:"id"`
	ProjectID        string            `json:"projectId"`
	ProjectRevision  int               `json:"projectRevision"`
	CreatedAt        string            `json:"createdAt"`
	CaseSet          CaseSetV1         `json:"caseSet"`
	Cases            []CaseV1          `json:"cases"`
	Candidates       []CandidateV1     `json:"candidates"`
	Evaluator        *EvaluatorV1      `json:"evaluator"`
	Execution        ExecutionPolicyV1 `json:"execution"`
	RunIDs           []string          `json:"runIds"`
	RerunParentRunID *string           `json:"rerunParentRunId"`
}

type ValidationIssueV1 struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
}

type ProjectValidationV1 struct {
	Ready          bool                `json:"ready"`
	CaseCount      int                 `json:"caseCount"`
	ExecutionCount int                 `json:"executionCount"`
	Issues         []ValidationIssueV1 `json:"issues"`
}

type ArtifactReferenceV1 struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	MediaType  string `json:"mediaType"`
	ByteLength int64  `json:"byteLength"`
	SHA256     string `json:"sha256"`
}

type ObservationV1 struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Kind         string   `json:"kind"`
	NumberValue  *float64 `json:"numberValue"`
	TextValue    *string  `json:"textValue"`
	BooleanValue *bool    `json:"booleanValue"`
}

type FindingV1 struct {
	CheckID   string `json:"checkId"`
	CheckName string `json:"checkName"`
	Status    string `json:"status"`
	Message   string `json:"message"`
}

type CaseResultV1 struct {
	CaseID               string                `json:"caseId"`
	CaseName             string                `json:"caseName"`
	Status               string                `json:"status"`
	Progress             float64               `json:"progress"`
	Message              string                `json:"message"`
	StartedAt            *string               `json:"startedAt"`
	CompletedAt          *string               `json:"completedAt"`
	DurationMilliseconds *int64                `json:"durationMilliseconds"`
	Output               json.RawMessage       `json:"output"`
	Observations         []ObservationV1       `json:"observations"`
	Findings             []FindingV1           `json:"findings"`
	Artifacts            []ArtifactReferenceV1 `json:"artifacts"`
	Stderr               string                `json:"stderr"`
	StderrTruncated      bool                  `json:"stderrTruncated"`
	Error                *StructuredErrorV1    `json:"error"`
}

type RunV1 struct {
	Version       int                `json:"version"`
	ID            string             `json:"id"`
	LaunchID      string             `json:"launchId"`
	CandidateID   string             `json:"candidateId"`
	CandidateName string             `json:"candidateName"`
	Status        string             `json:"status"`
	CreatedAt     string             `json:"createdAt"`
	StartedAt     *string            `json:"startedAt"`
	CompletedAt   *string            `json:"completedAt"`
	CaseResults   []CaseResultV1     `json:"caseResults"`
	RerunParentID *string            `json:"rerunParentId"`
	Error         *StructuredErrorV1 `json:"error"`
}

type ReviewV1 struct {
	Version        int     `json:"version"`
	LeftRunID      string  `json:"leftRunId"`
	RightRunID     string  `json:"rightRunId"`
	PreferredRunID *string `json:"preferredRunId"`
	Note           string  `json:"note"`
	UpdatedAt      string  `json:"updatedAt"`
}

type PutReviewRequestV1 struct {
	LeftRunID      string  `json:"leftRunId"`
	RightRunID     string  `json:"rightRunId"`
	PreferredRunID *string `json:"preferredRunId"`
	Note           string  `json:"note"`
}

type ApplicationSnapshotV1 struct {
	Version     string              `json:"version"`
	Project     ProjectV1           `json:"project"`
	Cases       []CaseV1            `json:"cases"`
	Validation  ProjectValidationV1 `json:"validation"`
	Launches    []LaunchV1          `json:"launches"`
	Runs        []RunV1             `json:"runs"`
	Reviews     []ReviewV1          `json:"reviews"`
	Diagnostics []StructuredErrorV1 `json:"diagnostics"`
}

type RuntimeSessionV1 struct {
	SchemaVersion string `json:"schemaVersion"`
	AppID         string `json:"appId"`
	ProjectPath   string `json:"projectPath"`
	InstanceNonce string `json:"instanceNonce"`
}

type CandidateCaseV1 struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Input    json.RawMessage `json:"input"`
	Expected json.RawMessage `json:"expected"`
}

type CandidateRequestV1 struct {
	ProtocolVersion string          `json:"protocolVersion"`
	RunID           string          `json:"runId"`
	Case            CandidateCaseV1 `json:"case"`
	OutputDirectory string          `json:"outputDirectory"`
}

type CandidateArtifactV1 struct {
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	Path      string `json:"path"`
}

type CandidateProgressV1 struct {
	Type     string  `json:"type"`
	Progress float64 `json:"progress"`
	Message  string  `json:"message"`
}

type CandidateResultV1 struct {
	Type         string                `json:"type"`
	Output       json.RawMessage       `json:"output"`
	Observations []ObservationV1       `json:"observations"`
	Artifacts    []CandidateArtifactV1 `json:"artifacts"`
}

type CandidateErrorV1 struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
}
