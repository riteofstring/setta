package director

import (
	"fmt"
	"strings"
)

// The Director decision protocol: the complete authority a routing model has
// over one submitted intent.
//
// The catalog itself is DirectorDecisionKinds(); this file owns the payloads
// the model may author, and decision_authority.go owns the trusted state that
// bounds them. Five properties distinguish this app-scoped protocol from the
// superseded conversation router:
//
//   - Targets are workstreams. The model never sees a pane id, a provider id,
//     an execution lease, an approval id, an artifact id, or a filesystem
//     path, so no decision it returns can carry presentation authority.
//   - `focus_conversation` became `select_workstream`. It moves app-wide
//     selection; it does not resolve, open, or focus a pane. The old kind had
//     to explain in its own schema description that it was not a renderer
//     command, which is the shape of a contract holding the wrong authority.
//   - `create_conversation`, `create_side_conversation`, and
//     `fork_conversation` collapsed into `create_workstream` with a typed
//     origin. The product difference between them is the new workstream's
//     parentage, not three separate decisions, and the graph already derives
//     `delegated_to` from parentage.
//   - `ask_narrator` is gone. The Director holds the app-scoped snapshot and
//     the selected workstream's semantic trajectory, so a status question is
//     `answer_directly`. Delegating it to a per-conversation narrator was a
//     consequence of the router only knowing pane-visible state.
//   - `recover_path` makes retry and recovery explicit when durable state
//     proves that either is the right next action.

const (
	// MaxDecisionIntentTextBytes bounds one submitted intent.
	MaxDecisionIntentTextBytes = 256 * 1024
	// MaxDecisionAuthoredInputBytes bounds input the Director authors for a
	// workstream. It matches the intent bound because the Director may pass
	// the user's request through unchanged.
	MaxDecisionAuthoredInputBytes = MaxDecisionIntentTextBytes
	// MaxDecisionAnswerBytes bounds a direct answer.
	MaxDecisionAnswerBytes = 64 * 1024
	// MaxDecisionTitleBytes bounds a proposed workstream title.
	MaxDecisionTitleBytes = 200
	// MaxDecisionReferenceBytes bounds every id the model may echo back.
	MaxDecisionReferenceBytes = 512
	// MaxDecisionExcerptBytes bounds context excerpts shown to the model.
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
// open. The model chooses a workspace id from an authorized enum; trusted
// product code resolves it to the absolute path in a
// WorkstreamResourceBinding. Model output never supplies a path.
type DecisionFolderResource struct {
	WorkspaceID string `json:"workspaceId"`
}

// DecisionResourceScope is the scope a new workstream should run in. It is the
// model-facing half of WorkstreamResourceScope, without the path.
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
// so the model cannot rescope existing work.
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

// AnswerDirectlyDecision answers from app-visible state without starting work.
type AnswerDirectlyDecision struct {
	Text string `json:"text"`
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

// DirectorDecision is exactly one typed decision for one submitted intent.
type DirectorDecision struct {
	Kind             DirectorDecisionKind      `json:"kind"`
	AnswerDirectly   *AnswerDirectlyDecision   `json:"answerDirectly"`
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
		DirectorDecisionAnswerDirectly:   decision.AnswerDirectly != nil,
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
	case DirectorDecisionAnswerDirectly:
		return validateDecisionText("answer", decision.AnswerDirectly.Text, MaxDecisionAnswerBytes)
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
