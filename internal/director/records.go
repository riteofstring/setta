package director

import (
	"fmt"

	"setta/internal/conversation"
)

// The Director-owned records the rails act on. Each one is durable app-scoped
// state with its own lifecycle, so the Now and Artifacts rails never derive an
// actionable affordance from a transient failure code or from view state.

// ApprovalRequest is one approval the user must resolve. Secret structured
// input stays behind the approval's own encrypted owner: this record carries
// only the public summary and the fact that an answer is secret.
type ApprovalRequest struct {
	ID            string                                    `json:"id"`
	WorkstreamID  string                                    `json:"workstreamId"`
	RunID         *string                                   `json:"runId"`
	Kind          conversation.TrajectoryApprovalKind       `json:"kind"`
	Status        ApprovalStatus                            `json:"status"`
	PublicSummary string                                    `json:"publicSummary"`
	Questions     []conversation.TrajectoryApprovalQuestion `json:"questions"`
	// Secret reports that the requested answer is a secret, so the resolution
	// is redacted everywhere except the provider path that asked for it.
	Secret         bool     `json:"secret"`
	SourceEventIDs []string `json:"sourceEventIds"`
	RequestedAt    string   `json:"requestedAt"`
	ResolvedAt     *string  `json:"resolvedAt"`
}

// ResourceRequest is one durable request for a resource a workstream needs
// before it can progress. It replaces deriving a "choose a folder" affordance
// from a routing failure code, which could only render when a pane existed.
type ResourceRequest struct {
	ID            string                 `json:"id"`
	WorkstreamID  string                 `json:"workstreamId"`
	RunID         *string                `json:"runId"`
	Kind          WorkstreamResourceKind `json:"kind"`
	Status        ResourceRequestStatus  `json:"status"`
	PublicSummary string                 `json:"publicSummary"`
	// ResolvedBinding is the binding trusted product code attached when the
	// user supplied the resource. Model output never populates it.
	ResolvedBinding *WorkstreamResourceBinding `json:"resolvedBinding"`
	SourceEventIDs  []string                   `json:"sourceEventIds"`
	RequestedAt     string                     `json:"requestedAt"`
	ResolvedAt      *string                    `json:"resolvedAt"`
}

// WorkstreamArtifact is one durable output addressed by workstream rather than
// by conversation, so the Artifacts rail can list app-wide results.
//
// WorkspaceID is the folder the producing workstream is scoped to, and is null
// when it has none. Publishing an artifact never needed the user's files, so a
// folderless workstream produces artifacts the rail lists like any other.
type WorkstreamArtifact struct {
	ID             string         `json:"id"`
	WorkstreamID   string         `json:"workstreamId"`
	ConversationID string         `json:"conversationId"`
	WorkspaceID    *string        `json:"workspaceId"`
	RunID          *string        `json:"runId"`
	Status         ArtifactStatus `json:"status"`
	Title          string         `json:"title"`
	SourceEventIDs []string       `json:"sourceEventIds"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
}

// ValidateApprovalRequest rejects an approval record trusted code could not
// have produced.
func ValidateApprovalRequest(request ApprovalRequest) error {
	if err := validateIdentifier("approval request id", request.ID); err != nil {
		return err
	}
	if err := validateIdentifier("approval request workstream id", request.WorkstreamID); err != nil {
		return err
	}
	if err := validateOptionalRunID("approval request run id", request.RunID); err != nil {
		return err
	}
	if !isTrajectoryApprovalKind(request.Kind) {
		return fmt.Errorf("unknown approval request kind %q", request.Kind)
	}
	if err := approvalLifecycle.validateStatus(request.Status); err != nil {
		return err
	}
	if err := validateTrimmedText("approval request public summary", request.PublicSummary); err != nil {
		return err
	}
	if err := validateApprovalRequestQuestions(request); err != nil {
		return err
	}
	if err := requireSourceEventIDs("approval request", request.SourceEventIDs); err != nil {
		return err
	}
	if err := validateTimestamp("approval request requested at", request.RequestedAt); err != nil {
		return err
	}
	if err := validateOptionalTimestamp("approval request resolved at", request.ResolvedAt); err != nil {
		return err
	}
	return validateApprovalRequestResolution(request)
}

func validateApprovalRequestResolution(request ApprovalRequest) error {
	resolved := request.Status != ApprovalStatusPending
	if resolved != (request.ResolvedAt != nil) {
		return fmt.Errorf("approval request %s resolution timestamp does not match status %q", request.ID, request.Status)
	}
	if request.ResolvedAt != nil {
		return validateTimestampOrder(
			fmt.Sprintf("approval request %s resolution timestamp", request.ID),
			request.RequestedAt,
			*request.ResolvedAt,
		)
	}
	return nil
}

func validateApprovalRequestQuestions(request ApprovalRequest) error {
	if request.Questions == nil {
		return fmt.Errorf("approval request %s questions must be an array, not null", request.ID)
	}
	if request.Secret != hasSecretQuestion(request.Questions) {
		return fmt.Errorf("approval request %s secret marker does not match its questions", request.ID)
	}
	for index, question := range request.Questions {
		if err := question.Validate(); err != nil {
			return fmt.Errorf("approval request %s question %d: %w", request.ID, index, err)
		}
	}
	return nil
}

// ValidateResourceRequest rejects a resource request record trusted code could
// not have produced.
func ValidateResourceRequest(request ResourceRequest) error {
	if err := validateIdentifier("resource request id", request.ID); err != nil {
		return err
	}
	if err := validateIdentifier("resource request workstream id", request.WorkstreamID); err != nil {
		return err
	}
	if err := validateOptionalRunID("resource request run id", request.RunID); err != nil {
		return err
	}
	if request.Kind != WorkstreamResourceKindFolder {
		return fmt.Errorf("unknown resource request kind %q", request.Kind)
	}
	if err := resourceRequestLifecycle.validateStatus(request.Status); err != nil {
		return err
	}
	if err := validateTrimmedText("resource request public summary", request.PublicSummary); err != nil {
		return err
	}
	if err := requireSourceEventIDs("resource request", request.SourceEventIDs); err != nil {
		return err
	}
	if err := validateTimestamp("resource request requested at", request.RequestedAt); err != nil {
		return err
	}
	if err := validateOptionalTimestamp("resource request resolved at", request.ResolvedAt); err != nil {
		return err
	}
	return validateResourceRequestResolution(request)
}

// validateResourceRequestResolution keeps a resolved request inseparable from
// the binding and timestamp that resolved it, so the rails cannot show a
// resolved request the product cannot explain.
func validateResourceRequestResolution(request ResourceRequest) error {
	resolved := request.Status == ResourceRequestStatusResolved
	if request.ResolvedBinding != nil {
		if !resolved {
			return fmt.Errorf("resource request %s carries a binding while %q", request.ID, request.Status)
		}
		if err := ValidateWorkstreamResourceBinding(*request.ResolvedBinding); err != nil {
			return fmt.Errorf("resource request %s: %w", request.ID, err)
		}
	} else if resolved {
		return fmt.Errorf("resolved resource request %s requires the binding that resolved it", request.ID)
	}
	if (request.Status != ResourceRequestStatusRequested) != (request.ResolvedAt != nil) {
		return fmt.Errorf("resource request %s resolution timestamp does not match status %q", request.ID, request.Status)
	}
	if request.ResolvedAt != nil {
		return validateTimestampOrder(
			fmt.Sprintf("resource request %s resolution timestamp", request.ID),
			request.RequestedAt,
			*request.ResolvedAt,
		)
	}
	return nil
}

// ValidateWorkstreamArtifact rejects an artifact record trusted code could not
// have produced.
func ValidateWorkstreamArtifact(artifact WorkstreamArtifact) error {
	if err := validateWorkstreamArtifactIdentity(artifact); err != nil {
		return err
	}
	if err := artifactLifecycle.validateStatus(artifact.Status); err != nil {
		return err
	}
	if err := validateTrimmedText("workstream artifact title", artifact.Title); err != nil {
		return err
	}
	if err := requireSourceEventIDs("workstream artifact", artifact.SourceEventIDs); err != nil {
		return err
	}
	return validateWorkstreamArtifactTimestamps(artifact)
}

func validateWorkstreamArtifactIdentity(artifact WorkstreamArtifact) error {
	if err := validateIdentifier("workstream artifact id", artifact.ID); err != nil {
		return err
	}
	if err := validateIdentifier("workstream artifact workstream id", artifact.WorkstreamID); err != nil {
		return err
	}
	if err := validateIdentifier("workstream artifact conversation id", artifact.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("workstream artifact workspace id", artifact.WorkspaceID); err != nil {
		return err
	}
	if err := validateOptionalRunID("workstream artifact run id", artifact.RunID); err != nil {
		return err
	}
	return nil
}

func validateWorkstreamArtifactTimestamps(artifact WorkstreamArtifact) error {
	if err := validateTimestamp("workstream artifact created at", artifact.CreatedAt); err != nil {
		return err
	}
	if err := validateTimestamp("workstream artifact updated at", artifact.UpdatedAt); err != nil {
		return err
	}
	return validateTimestampOrder(
		fmt.Sprintf("workstream artifact %s timestamp", artifact.ID),
		artifact.CreatedAt,
		artifact.UpdatedAt,
	)
}

func validateOptionalRunID(label string, runID *string) error {
	if runID == nil {
		return nil
	}
	return validateIdentifier(label, *runID)
}

func isTrajectoryApprovalKind(kind conversation.TrajectoryApprovalKind) bool {
	switch kind {
	case conversation.TrajectoryApprovalKindCommand,
		conversation.TrajectoryApprovalKindFileChange,
		conversation.TrajectoryApprovalKindPermission,
		conversation.TrajectoryApprovalKindStructuredInput,
		conversation.TrajectoryApprovalKindUserInput,
		conversation.TrajectoryApprovalKindMCPElicitation:
		return true
	default:
		return false
	}
}
