package contracts

import "encoding/json"

const (
	ContractVersion = 1
)

type ProjectManifest struct {
	Version  int      `json:"version"`
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Requests []string `json:"requests"`
}

type ReviewRequest struct {
	Version           int                 `json:"version"`
	ID                string              `json:"id"`
	Type              string              `json:"type"`
	Title             string              `json:"title"`
	RequestedDecision string              `json:"requestedDecision"`
	Evidence          []EvidenceReference `json:"evidence"`
	Relations         []EvidenceRelation  `json:"relations"`
	Provenance        Provenance          `json:"provenance"`
	Completion        *CompletionRequest  `json:"completion,omitempty"`
	Choice            *ChoiceRequest      `json:"choice,omitempty"`
}

type CompletionRequest struct {
	Claims []CompletionClaim `json:"claims"`
}

type CompletionClaim struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type ChoiceRequest struct {
	Presentation     string                `json:"presentation"`
	ExpectedResponse string                `json:"expectedResponse"`
	Options          []ChoiceOption        `json:"options"`
	Factors          []ChoiceFactor        `json:"factors"`
	Tradeoffs        []ChoiceTradeoff      `json:"tradeoffs"`
	Recommendation   *ChoiceRecommendation `json:"recommendation"`
}

type ChoiceOption struct {
	ID                 string  `json:"id"`
	Label              string  `json:"label"`
	Description        string  `json:"description"`
	ArtifactEvidenceID *string `json:"artifactEvidenceId"`
}

type ChoiceFactor struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type ChoiceTradeoff struct {
	OptionID string `json:"optionId"`
	FactorID string `json:"factorId"`
	Value    string `json:"value"`
	Tone     string `json:"tone"`
}

type ChoiceRecommendation struct {
	OptionID  string `json:"optionId"`
	Rationale string `json:"rationale"`
}

type EvidenceReference struct {
	ID       string                     `json:"id"`
	Kind     string                     `json:"kind"`
	GitDiff  *GitDiffEvidenceReference  `json:"gitDiff,omitempty"`
	Text     *TextEvidenceReference     `json:"text,omitempty"`
	JSON     *JSONEvidenceReference     `json:"json,omitempty"`
	Artifact *ArtifactEvidenceReference `json:"artifact,omitempty"`
}

type GitDiffEvidenceReference struct {
	RepositoryPath string  `json:"repositoryPath"`
	BaseRevision   string  `json:"baseRevision"`
	TargetRevision *string `json:"targetRevision"`
	Path           string  `json:"path"`
	ContextLines   int     `json:"contextLines"`
	Hunk           GitHunk `json:"hunk"`
}

type GitHunk struct {
	OldStart int `json:"oldStart"`
	OldLines int `json:"oldLines"`
	NewStart int `json:"newStart"`
	NewLines int `json:"newLines"`
}

type TextEvidenceReference struct {
	Path      string `json:"path"`
	MediaType string `json:"mediaType"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
}

type JSONEvidenceReference struct {
	Path     string   `json:"path"`
	Pointers []string `json:"pointers"`
}

type ArtifactEvidenceReference struct {
	Path       string `json:"path"`
	MediaType  string `json:"mediaType"`
	ByteLength int64  `json:"byteLength"`
	SHA256     string `json:"sha256"`
}

type EvidenceRelation struct {
	ID          string             `json:"id"`
	SubjectKind string             `json:"subjectKind"`
	SubjectID   string             `json:"subjectId"`
	EvidenceID  string             `json:"evidenceId"`
	Role        string             `json:"role"`
	Citations   []EvidenceCitation `json:"citations"`
}

type EvidenceCitation struct {
	Kind      string  `json:"kind"`
	StartLine *int    `json:"startLine,omitempty"`
	EndLine   *int    `json:"endLine,omitempty"`
	Pointer   *string `json:"pointer,omitempty"`
}

type Provenance struct {
	Producer  ProducerIdentity `json:"producer"`
	CreatedAt string           `json:"createdAt"`
}

type ProducerIdentity struct {
	Kind    string  `json:"kind"`
	Name    string  `json:"name"`
	Model   *string `json:"model,omitempty"`
	Harness *string `json:"harness,omitempty"`
}

type ExternalAssessment struct {
	Version    int                `json:"version"`
	ID         string             `json:"id"`
	RequestID  string             `json:"requestId"`
	ClaimID    string             `json:"claimId"`
	Assessment string             `json:"assessment"`
	Rationale  string             `json:"rationale"`
	Caveat     *string            `json:"caveat"`
	Producer   AssessmentProducer `json:"producer"`
	CreatedAt  string             `json:"createdAt"`
}

type AssessmentProducer struct {
	Model   string `json:"model"`
	Harness string `json:"harness"`
}

type ReviewResponse struct {
	Version       int                  `json:"version"`
	ID            string               `json:"id"`
	RequestID     string               `json:"requestId"`
	RequestSHA256 string               `json:"requestSha256"`
	Type          string               `json:"type"`
	Status        string               `json:"status"`
	Rationale     string               `json:"rationale"`
	Unresolved    []UnresolvedItem     `json:"unresolved"`
	Annotations   []ArtifactAnnotation `json:"annotations"`
	Provenance    Provenance           `json:"provenance"`
	Completion    *CompletionResponse  `json:"completion,omitempty"`
	Choice        *ChoiceResponse      `json:"choice,omitempty"`
}

type CompletionResponse struct {
	Decisions []CompletionDecision `json:"decisions"`
}

type CompletionDecision struct {
	ClaimID       string  `json:"claimId"`
	Decision      string  `json:"decision"`
	Rationale     string  `json:"rationale"`
	Qualification *string `json:"qualification"`
}

type ChoiceResponse struct {
	Outcome                     string   `json:"outcome"`
	OptionIDs                   []string `json:"optionIds"`
	Conditions                  []string `json:"conditions"`
	SelectedArtifactEvidenceIDs []string `json:"selectedArtifactEvidenceIds"`
}

type UnresolvedItem struct {
	SubjectKind string `json:"subjectKind"`
	SubjectID   string `json:"subjectId"`
	Reason      string `json:"reason"`
}

type ArtifactAnnotation struct {
	ID                 string           `json:"id"`
	ArtifactEvidenceID string           `json:"artifactEvidenceId"`
	ArtifactSHA256     string           `json:"artifactSha256"`
	Paths              []NormalizedPath `json:"paths"`
}

type NormalizedPath struct {
	Color  string            `json:"color"`
	Width  float64           `json:"width"`
	Points []NormalizedPoint `json:"points"`
}

type NormalizedPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ReviewMutation struct {
	ProjectID        string            `json:"projectId"`
	ExpectedRevision uint64            `json:"expectedRevision"`
	Operations       []json.RawMessage `json:"operations"`
}

type ImportAssessmentOperation struct {
	Operation  string             `json:"op"`
	Assessment ExternalAssessment `json:"assessment"`
}

type SetResponseOperation struct {
	Operation string         `json:"op"`
	Response  ReviewResponse `json:"response"`
}

type DeleteResponseOperation struct {
	Operation string `json:"op"`
	RequestID string `json:"requestId"`
}

type ReviewSnapshot struct {
	Version  int               `json:"version"`
	Project  ProjectManifest   `json:"project"`
	Revision uint64            `json:"revision"`
	Requests []RequestSnapshot `json:"requests"`
}

type RequestSnapshot struct {
	Path        string               `json:"path"`
	SHA256      string               `json:"sha256"`
	Request     ReviewRequest        `json:"request"`
	Assessments []ExternalAssessment `json:"assessments"`
	Response    *ReviewResponse      `json:"response"`
	Evidence    []ResolvedEvidence   `json:"evidence"`
}

type ResolvedEvidence struct {
	EvidenceID string                   `json:"evidenceId"`
	Status     string                   `json:"status"`
	Content    *ResolvedEvidenceContent `json:"content"`
	Error      *StructuredError         `json:"error"`
}

type ResolvedEvidenceContent struct {
	Kind        string          `json:"kind"`
	UnifiedDiff *string         `json:"unifiedDiff,omitempty"`
	Text        *string         `json:"text,omitempty"`
	StartLine   *int            `json:"startLine,omitempty"`
	EndLine     *int            `json:"endLine,omitempty"`
	JSON        json.RawMessage `json:"json,omitempty"`
	Route       *string         `json:"route,omitempty"`
	MediaType   *string         `json:"mediaType,omitempty"`
	ByteLength  *int64          `json:"byteLength,omitempty"`
	SHA256      *string         `json:"sha256,omitempty"`
	Truncated   *bool           `json:"truncated,omitempty"`
}

type ContinuationPacket struct {
	Version       int                `json:"version"`
	ProjectID     string             `json:"projectId"`
	Request       ReviewRequest      `json:"request"`
	RequestSHA256 string             `json:"requestSha256"`
	Response      ReviewResponse     `json:"response"`
	Evidence      []ResolvedEvidence `json:"evidence"`
}

type ExportDocument struct {
	Version       int                  `json:"version"`
	ProjectID     string               `json:"projectId"`
	Revision      uint64               `json:"revision"`
	Responses     []ReviewResponse     `json:"responses"`
	Continuations []ContinuationPacket `json:"continuations"`
}

type MutationResult struct {
	Version  int            `json:"version"`
	Snapshot ReviewSnapshot `json:"snapshot"`
}

type ExportResult struct {
	Version int            `json:"version"`
	Export  ExportDocument `json:"export"`
}

type StructuredError struct {
	Code       string  `json:"code"`
	Message    string  `json:"message"`
	Field      *string `json:"field"`
	RequestID  *string `json:"requestId"`
	EvidenceID *string `json:"evidenceId"`
}
