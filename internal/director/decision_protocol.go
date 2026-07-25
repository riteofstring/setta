package director

import (
	"fmt"
	"strings"
)

// The Director's trusted app-action protocol.
//
// Setta tool handlers and direct shell commands build these payloads, while
// decision_authority.go owns the durable state that bounds them. Targets are
// workstreams and authorized workspace ids; provider, pane, lease, and
// filesystem identities never cross this boundary.

const (
	// MaxDecisionIntentTextBytes bounds one submitted intent.
	MaxDecisionIntentTextBytes = 256 * 1024
	// MaxDecisionAuthoredInputBytes bounds input the Director authors for a
	// workstream. It matches the intent bound because the Director may pass
	// the user's request through unchanged.
	MaxDecisionAuthoredInputBytes = MaxDecisionIntentTextBytes
	// MaxDecisionTitleBytes bounds a proposed workstream title.
	MaxDecisionTitleBytes = 200
	// MaxDecisionReferenceBytes bounds every id a Director tool may echo back.
	MaxDecisionReferenceBytes = 512
	// MaxDecisionExcerptBytes bounds context excerpts shown to the Director.
	MaxDecisionExcerptBytes = 512
)

// DecisionIntentModality is how the user supplied the intent. Voice and text
// reach the Director through the same decision protocol, so the modality is
// provenance rather than a separate path.
type DecisionIntentModality string

const (
	DecisionIntentModalityText  DecisionIntentModality = "text"
	DecisionIntentModalityVoice DecisionIntentModality = "voice"
)

var decisionIntentModalities = []DecisionIntentModality{
	DecisionIntentModalityText,
	DecisionIntentModalityVoice,
}

// SubmittedIntent is one accepted user request awaiting a decision.
type SubmittedIntent struct {
	ID          string                 `json:"id"`
	Text        string                 `json:"text"`
	Modality    DecisionIntentModality `json:"modality"`
	SubmittedAt string                 `json:"submittedAt"`
}

// DecisionFolderResource references a folder resource the app already has
// open. The Director chooses a workspace id returned by Setta; trusted product
// code resolves it to the absolute path in a
// WorkstreamResourceBinding. Model output never supplies a path.
type DecisionFolderResource struct {
	WorkspaceID string `json:"workspaceId"`
}

// DecisionResourceScope is the scope a new workstream should run in. It is the
// Director-facing half of WorkstreamResourceScope, without the path.
type DecisionResourceScope struct {
	Kind   WorkstreamResourceScopeKind `json:"kind"`
	Folder *DecisionFolderResource     `json:"folder"`
}

// WorkstreamCreationOriginKind is where a new workstream comes from.
type WorkstreamCreationOriginKind string

const (
	// WorkstreamCreationRoot starts an independent workstream.
	WorkstreamCreationRoot WorkstreamCreationOriginKind = "root"
	// WorkstreamCreationChild starts a workstream under a parent, which the
	// graph connects with a delegated_to edge.
	WorkstreamCreationChild WorkstreamCreationOriginKind = "child"
	// WorkstreamCreationFork starts a workstream from a completed run of a
	// parent, carrying that run's history forward.
	WorkstreamCreationFork WorkstreamCreationOriginKind = "fork"
)

// RootWorkstreamOrigin creates an independent workstream. Only a root
// workstream chooses its own scope; a child or a fork inherits the parent's,
// so the Director cannot rescope existing work.
type RootWorkstreamOrigin struct {
	ResourceScope DecisionResourceScope `json:"resourceScope"`
}

// ChildWorkstreamOrigin creates a durable child of an authorized parent.
type ChildWorkstreamOrigin struct {
	ParentWorkstreamID string `json:"parentWorkstreamId"`
}

// ForkWorkstreamOrigin creates a durable fork from one completed run of an
// authorized parent.
type ForkWorkstreamOrigin struct {
	ParentWorkstreamID string `json:"parentWorkstreamId"`
	ForkedAtRunID      string `json:"forkedAtRunId"`
}

// WorkstreamCreationOrigin selects exactly one origin payload.
type WorkstreamCreationOrigin struct {
	Kind  WorkstreamCreationOriginKind `json:"kind"`
	Root  *RootWorkstreamOrigin        `json:"root"`
	Child *ChildWorkstreamOrigin       `json:"child"`
	Fork  *ForkWorkstreamOrigin        `json:"fork"`
}

// CreateWorkstreamDecision starts a workstream. The id, the resource binding,
// and the registry record are attached by trusted product code afterwards.
type CreateWorkstreamDecision struct {
	Origin        WorkstreamCreationOrigin `json:"origin"`
	InitialInput  string                   `json:"initialInput"`
	ProposedTitle string                   `json:"proposedTitle"`
}

// SendToWorkstreamDecision sends work to an idle existing workstream.
type SendToWorkstreamDecision struct {
	WorkstreamID  string `json:"workstreamId"`
	AuthoredInput string `json:"authoredInput"`
}

// QueueBehindRunDecision preserves an active run and queues work after it.
type QueueBehindRunDecision struct {
	WorkstreamID  string `json:"workstreamId"`
	AuthoredInput string `json:"authoredInput"`
}

// SteerRunDecision changes the instruction of an active run.
type SteerRunDecision struct {
	WorkstreamID  string `json:"workstreamId"`
	AuthoredInput string `json:"authoredInput"`
}

// SelectWorkstreamDecision moves app-wide selection. It carries no
// presentation authority: the shell owns how a selected workstream is shown.
type SelectWorkstreamDecision struct {
	WorkstreamID string `json:"workstreamId"`
}

// RecoverPathDecision retries or recovers a failed path. FailureEventID names
// the durable failure trusted context offered, so a recovery always says which
// fact it is acting on.
type RecoverPathDecision struct {
	WorkstreamID   string `json:"workstreamId"`
	FailureEventID string `json:"failureEventId"`
}

// DirectorDecision is one typed app action produced while serving a submitted
// intent. A tool-using turn may produce several. Answering is not one of them:
// what the Director said is its conversation, not an app action.
type DirectorDecision struct {
	Kind             DirectorDecisionKind      `json:"kind"`
	CreateWorkstream *CreateWorkstreamDecision `json:"createWorkstream"`
	SendToWorkstream *SendToWorkstreamDecision `json:"sendToWorkstream"`
	QueueBehindRun   *QueueBehindRunDecision   `json:"queueBehindRun"`
	SteerRun         *SteerRunDecision         `json:"steerRun"`
	SelectWorkstream *SelectWorkstreamDecision `json:"selectWorkstream"`
	RecoverPath      *RecoverPathDecision      `json:"recoverPath"`
}

// decisionPayloads pairs each decision kind with its payload slot, so presence
// is checked by one loop rather than by a chain of nil comparisons that could
// silently omit a kind.
func decisionPayloads(decision DirectorDecision) map[DirectorDecisionKind]bool {
	return map[DirectorDecisionKind]bool{
		DirectorDecisionCreateWorkstream: decision.CreateWorkstream != nil,
		DirectorDecisionSendToWorkstream: decision.SendToWorkstream != nil,
		DirectorDecisionQueueBehindRun:   decision.QueueBehindRun != nil,
		DirectorDecisionSteerRun:         decision.SteerRun != nil,
		DirectorDecisionSelectWorkstream: decision.SelectWorkstream != nil,
		DirectorDecisionRecoverPath:      decision.RecoverPath != nil,
	}
}

// Validate checks the decision's own shape. It does not check authority;
// ValidateDecisionAuthority does, and a decision must pass both before any
// product effect is committed.
func (decision DirectorDecision) Validate() error {
	present := decisionPayloads(decision)
	if _, known := present[decision.Kind]; !known {
		return rejectedDecision(fmt.Sprintf("unknown director decision kind %q", decision.Kind))
	}
	for kind, populated := range present {
		if populated != (kind == decision.Kind) {
			return rejectedDecision(fmt.Sprintf("director decision %q must populate exactly its own payload", decision.Kind))
		}
	}
	return decision.validatePayload()
}

func (decision DirectorDecision) validatePayload() error {
	switch decision.Kind {
	case DirectorDecisionCreateWorkstream:
		return validateCreateWorkstreamDecision(*decision.CreateWorkstream)
	case DirectorDecisionSendToWorkstream:
		return validateWorkstreamWork("send", decision.SendToWorkstream.WorkstreamID, decision.SendToWorkstream.AuthoredInput)
	case DirectorDecisionQueueBehindRun:
		return validateWorkstreamWork("queue", decision.QueueBehindRun.WorkstreamID, decision.QueueBehindRun.AuthoredInput)
	case DirectorDecisionSteerRun:
		return validateWorkstreamWork("steer", decision.SteerRun.WorkstreamID, decision.SteerRun.AuthoredInput)
	case DirectorDecisionSelectWorkstream:
		return validateDecisionReference("selected workstream id", decision.SelectWorkstream.WorkstreamID)
	case DirectorDecisionRecoverPath:
		return validateRecoverPathDecision(*decision.RecoverPath)
	default:
		return rejectedDecision(fmt.Sprintf("unknown director decision kind %q", decision.Kind))
	}
}

// validateCreateWorkstreamDecision allows a workstream with no initial input.
// An idle workstream the user can start work in later is a real outcome, so
// requiring first words here would force the Director to invent them.
func validateCreateWorkstreamDecision(payload CreateWorkstreamDecision) error {
	if err := validateWorkstreamCreationOrigin(payload.Origin); err != nil {
		return err
	}
	if payload.InitialInput != "" {
		if err := validateDecisionText("initial input", payload.InitialInput, MaxDecisionAuthoredInputBytes); err != nil {
			return err
		}
	}
	return validateDecisionText("proposed workstream title", payload.ProposedTitle, MaxDecisionTitleBytes)
}

func validateWorkstreamCreationOrigin(origin WorkstreamCreationOrigin) error {
	present := map[WorkstreamCreationOriginKind]bool{
		WorkstreamCreationRoot:  origin.Root != nil,
		WorkstreamCreationChild: origin.Child != nil,
		WorkstreamCreationFork:  origin.Fork != nil,
	}
	if _, known := present[origin.Kind]; !known {
		return rejectedDecision(fmt.Sprintf("unknown workstream creation origin %q", origin.Kind))
	}
	for kind, populated := range present {
		if populated != (kind == origin.Kind) {
			return rejectedDecision(fmt.Sprintf("workstream creation origin %q must populate exactly its own payload", origin.Kind))
		}
	}
	return validateCreationOriginPayload(origin)
}

func validateCreationOriginPayload(origin WorkstreamCreationOrigin) error {
	switch origin.Kind {
	case WorkstreamCreationRoot:
		return validateDecisionResourceScope(origin.Root.ResourceScope)
	case WorkstreamCreationChild:
		return validateDecisionReference("child parent workstream id", origin.Child.ParentWorkstreamID)
	case WorkstreamCreationFork:
		if err := validateDecisionReference("fork parent workstream id", origin.Fork.ParentWorkstreamID); err != nil {
			return err
		}
		return validateDecisionReference("forked at run id", origin.Fork.ForkedAtRunID)
	default:
		return rejectedDecision(fmt.Sprintf("unknown workstream creation origin %q", origin.Kind))
	}
}

func validateDecisionResourceScope(scope DecisionResourceScope) error {
	switch scope.Kind {
	case WorkstreamResourceScopeFolderless:
		if scope.Folder != nil {
			return rejectedDecision("folderless decision scope must not carry a folder")
		}
		return nil
	case WorkstreamResourceScopeFolder:
		if scope.Folder == nil {
			return rejectedDecision("folder decision scope requires a folder")
		}
		return validateDecisionReference("decision scope workspace id", scope.Folder.WorkspaceID)
	default:
		return rejectedDecision(fmt.Sprintf("unknown decision resource scope kind %q", scope.Kind))
	}
}

func validateRecoverPathDecision(payload RecoverPathDecision) error {
	if err := validateDecisionReference("recovered workstream id", payload.WorkstreamID); err != nil {
		return err
	}
	return validateDecisionReference("recovered failure event id", payload.FailureEventID)
}

func validateWorkstreamWork(label string, workstreamID string, authoredInput string) error {
	if err := validateDecisionReference(label+" target workstream id", workstreamID); err != nil {
		return err
	}
	return validateDecisionText(label+" authored input", authoredInput, MaxDecisionAuthoredInputBytes)
}

func validateDecisionReference(label string, value string) error {
	if value == "" || strings.TrimSpace(value) != value {
		return rejectedDecision(fmt.Sprintf("%s must be a trimmed non-empty reference", label))
	}
	if len(value) > MaxDecisionReferenceBytes {
		return rejectedDecision(fmt.Sprintf("%s exceeds %d bytes", label, MaxDecisionReferenceBytes))
	}
	return nil
}

func validateDecisionText(label string, value string, maximum int) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
		return rejectedDecision(fmt.Sprintf("%s must be non-empty without surrounding whitespace", label))
	}
	if len(value) > maximum {
		return rejectedDecision(fmt.Sprintf("%s exceeds %d bytes", label, maximum))
	}
	return nil
}

// DecisionTargetWorkstreamID returns the existing workstream a decision acts
// on. A create decision returns nothing even when it names a parent, because
// its target is the workstream trusted code has not minted yet.
func DecisionTargetWorkstreamID(decision DirectorDecision) *string {
	switch decision.Kind {
	case DirectorDecisionSendToWorkstream:
		return &decision.SendToWorkstream.WorkstreamID
	case DirectorDecisionQueueBehindRun:
		return &decision.QueueBehindRun.WorkstreamID
	case DirectorDecisionSteerRun:
		return &decision.SteerRun.WorkstreamID
	case DirectorDecisionSelectWorkstream:
		return &decision.SelectWorkstream.WorkstreamID
	case DirectorDecisionRecoverPath:
		return &decision.RecoverPath.WorkstreamID
	default:
		return nil
	}
}

// DecisionParentWorkstreamID returns the authorized parent a create decision
// hangs its new workstream from.
func DecisionParentWorkstreamID(decision DirectorDecision) *string {
	if decision.Kind != DirectorDecisionCreateWorkstream {
		return nil
	}
	switch decision.CreateWorkstream.Origin.Kind {
	case WorkstreamCreationChild:
		return &decision.CreateWorkstream.Origin.Child.ParentWorkstreamID
	case WorkstreamCreationFork:
		return &decision.CreateWorkstream.Origin.Fork.ParentWorkstreamID
	default:
		return nil
	}
}

func isDecisionIntentModality(modality DecisionIntentModality) bool {
	for _, candidate := range decisionIntentModalities {
		if candidate == modality {
			return true
		}
	}
	return false
}
