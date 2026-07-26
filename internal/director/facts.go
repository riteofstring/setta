package director

import "fmt"

// The durable Director-owned runtime facts.
//
// A conversation trajectory event says what happened inside one conversation. It
// cannot say which workstream the app selected, which decision routed the work,
// which resource the work is waiting for, or what the Director concluded. Those
// are app-scoped facts, and before this contract the shell could only infer them
// from a routing failure code, the presence of a pane, or the shape of a rendered
// list. Each one is committed here as a typed event instead.

// DirectorDecisionKind is the catalog of decisions the Director may commit for
// one submitted intent. Setta tools choose a kind and target only from current
// trusted application state; trusted product code attaches durable ids.
type DirectorDecisionKind string

const (
	// DirectorDecisionCreateWorkstream starts a new folderless or resource-bound
	// workstream.
	DirectorDecisionCreateWorkstream DirectorDecisionKind = "create_workstream"
	// DirectorDecisionSendToWorkstream sends work to an idle existing workstream.
	DirectorDecisionSendToWorkstream DirectorDecisionKind = "send_to_workstream"
	// DirectorDecisionQueueBehindRun queues work behind an active workstream.
	DirectorDecisionQueueBehindRun DirectorDecisionKind = "queue_behind_run"
	// DirectorDecisionSteerRun changes the instruction of an active run.
	DirectorDecisionSteerRun DirectorDecisionKind = "steer_run"
	// DirectorDecisionSelectWorkstream focuses an existing workstream.
	DirectorDecisionSelectWorkstream DirectorDecisionKind = "select_workstream"
	// DirectorDecisionRecoverPath retries or recovers a failed execution path
	// that durable state proves is the right next action.
	DirectorDecisionRecoverPath DirectorDecisionKind = "recover_path"
)

var directorDecisionKinds = []DirectorDecisionKind{
	DirectorDecisionCreateWorkstream,
	DirectorDecisionSendToWorkstream,
	DirectorDecisionQueueBehindRun,
	DirectorDecisionSteerRun,
	DirectorDecisionSelectWorkstream,
	DirectorDecisionRecoverPath,
}

// DirectorDecisionKinds returns the ordered decision catalog.
func DirectorDecisionKinds() []DirectorDecisionKind {
	return append([]DirectorDecisionKind(nil), directorDecisionKinds...)
}

// DirectorWorkstreamSelected moves app-wide selection. Selection is persisted
// app state with no pane identity, and it never writes graph truth.
type DirectorWorkstreamSelected struct {
	PreviousWorkstreamID *string `json:"previousWorkstreamId"`
}

// DirectorWorkstreamResourceBound attaches a resource the user supplied.
type DirectorWorkstreamResourceBound struct {
	Binding WorkstreamResourceBinding `json:"binding"`
}

// DirectorDecisionCommitted is a Director decision that already passed trusted
// validation. Trusted code derives its ids and public summary; provider output
// can request an action but does not author the durable fact.
type DirectorDecisionCommitted struct {
	Decision DirectorDecisionKind `json:"decision"`
	// IntentID is the submitted intent this decision served. A tool-using turn
	// can commit several action decisions under the same id.
	IntentID      string `json:"intentId"`
	PublicSummary string `json:"publicSummary"`
	// TargetWorkstreamID is the authorized target trusted code attached. It is
	// null only for a decision that targets no workstream.
	TargetWorkstreamID *string `json:"targetWorkstreamId"`
}

// DirectorResourceRequestOpened is the durable request that replaces deriving a
// "choose a folder" affordance from a routing failure code.
type DirectorResourceRequestOpened struct {
	RequestID     string                 `json:"requestId"`
	Kind          WorkstreamResourceKind `json:"kind"`
	PublicSummary string                 `json:"publicSummary"`
}

// DirectorResourceRequestResolved closes a resource request. A resolved request
// is inseparable from the binding that resolved it.
type DirectorResourceRequestResolved struct {
	RequestID string                     `json:"requestId"`
	Status    ResourceRequestStatus      `json:"status"`
	Binding   *WorkstreamResourceBinding `json:"binding"`
}

// DirectorRecoveryAttempted is trusted product code acting on a failed,
// interrupted, lost, or unavailable execution path. It is what a recovered_by
// edge is derived from.
type DirectorRecoveryAttempted struct {
	RecoveryID string         `json:"recoveryId"`
	Status     RecoveryStatus `json:"status"`
	// FailureEventID is the durable event that recorded the state being
	// recovered.
	FailureEventID string `json:"failureEventId"`
	PublicSummary  string `json:"publicSummary"`
}

// DirectorFactEvent is one durable Director-owned fact. Kind selects exactly one
// populated payload, so an unhandled fact fails at the boundary instead of
// silently projecting nothing.
type DirectorFactEvent struct {
	ID        string             `json:"id"`
	EmittedAt string             `json:"emittedAt"`
	Kind      DirectorSourceFact `json:"kind"`
	// WorkstreamID is the workstream the fact happened in. It is null only for a
	// decision that created a workstream: that decision was made before the
	// workstream existed, so it happened in the Director's own lane. Every other
	// fact belongs to a workstream, so omitting it fails.
	WorkstreamID *string `json:"workstreamId"`
	// RunID binds the fact to a durable run when one caused it, such as a
	// resource request opened by work that could not start.
	RunID                   *string                          `json:"runId"`
	Actor                   SemanticActor                    `json:"actor"`
	WorkstreamSelected      *DirectorWorkstreamSelected      `json:"workstreamSelected"`
	WorkstreamResourceBound *DirectorWorkstreamResourceBound `json:"workstreamResourceBound"`
	DecisionCommitted       *DirectorDecisionCommitted       `json:"decisionCommitted"`
	ResourceRequestOpened   *DirectorResourceRequestOpened   `json:"resourceRequestOpened"`
	ResourceRequestResolved *DirectorResourceRequestResolved `json:"resourceRequestResolved"`
	RecoveryAttempted       *DirectorRecoveryAttempted       `json:"recoveryAttempted"`
}

// ValidateDirectorFactEvent rejects a fact trusted product code could not have
// committed.
func ValidateDirectorFactEvent(fact DirectorFactEvent) error {
	if err := validateIdentifier("director fact id", fact.ID); err != nil {
		return err
	}
	if err := validateTimestamp("director fact emitted at", fact.EmittedAt); err != nil {
		return err
	}
	if err := validateOptionalRunID("director fact run id", fact.RunID); err != nil {
		return err
	}
	if !isSemanticActor(fact.Actor) {
		return fmt.Errorf("director fact %s has unknown actor %q", fact.ID, fact.Actor)
	}
	if err := validateDirectorFactPayloadPresence(fact); err != nil {
		return err
	}
	if err := validateDirectorFactWorkstream(fact); err != nil {
		return err
	}
	return validateDirectorFactPayload(fact)
}

// validateDirectorFactWorkstream requires the workstream every fact but a root
// creation decision happens in. The payload is checked first, because whether a
// decision is app-scoped is a property of the decision it committed.
func validateDirectorFactWorkstream(fact DirectorFactEvent) error {
	if fact.WorkstreamID != nil {
		return validateIdentifier("director fact workstream id", *fact.WorkstreamID)
	}
	if fact.Kind != DirectorFactDecisionCommitted {
		return fmt.Errorf("director fact %s of kind %q requires a workstream", fact.ID, fact.Kind)
	}
	if fact.RunID != nil {
		return fmt.Errorf("director fact %s names a run without the workstream that owns it", fact.ID)
	}
	return nil
}

// directorFactPayloads pairs each fact kind with its payload slot, so presence
// is checked by one loop rather than by a chain of nil comparisons that could
// silently omit a kind.
func directorFactPayloads(fact DirectorFactEvent) map[DirectorSourceFact]bool {
	return map[DirectorSourceFact]bool{
		DirectorFactWorkstreamSelected:      fact.WorkstreamSelected != nil,
		DirectorFactWorkstreamResourceBound: fact.WorkstreamResourceBound != nil,
		DirectorFactDecisionCommitted:       fact.DecisionCommitted != nil,
		DirectorFactResourceRequestOpened:   fact.ResourceRequestOpened != nil,
		DirectorFactResourceRequestResolved: fact.ResourceRequestResolved != nil,
		DirectorFactRecoveryAttempted:       fact.RecoveryAttempted != nil,
	}
}

func validateDirectorFactPayloadPresence(fact DirectorFactEvent) error {
	present := directorFactPayloads(fact)
	if _, known := present[fact.Kind]; !known {
		return fmt.Errorf("director fact %s has unknown kind %q", fact.ID, fact.Kind)
	}
	for kind, populated := range present {
		if populated != (kind == fact.Kind) {
			return fmt.Errorf("director fact %s of kind %q must populate exactly its own payload", fact.ID, fact.Kind)
		}
	}
	return nil
}

func validateDirectorFactPayload(fact DirectorFactEvent) error {
	switch fact.Kind {
	case DirectorFactWorkstreamSelected:
		return validateOptionalIdentifier("selected previous workstream id", fact.WorkstreamSelected.PreviousWorkstreamID)
	case DirectorFactWorkstreamResourceBound:
		return ValidateWorkstreamResourceBinding(fact.WorkstreamResourceBound.Binding)
	case DirectorFactDecisionCommitted:
		return validateCommittedDecision(fact)
	case DirectorFactResourceRequestOpened:
		return validateOpenedResourceRequest(fact)
	case DirectorFactResourceRequestResolved:
		return validateResolvedResourceRequest(fact)
	case DirectorFactRecoveryAttempted:
		return validateAttemptedRecovery(fact)
	default:
		return fmt.Errorf("director fact %s has unknown kind %q", fact.ID, fact.Kind)
	}
}

func validateCommittedDecision(fact DirectorFactEvent) error {
	payload := fact.DecisionCommitted
	if !isDirectorDecisionKind(payload.Decision) {
		return fmt.Errorf("director fact %s has unknown decision kind %q", fact.ID, payload.Decision)
	}
	if fact.Actor != SemanticActorDirector {
		return fmt.Errorf("director fact %s commits a decision attributed to %q", fact.ID, fact.Actor)
	}
	if err := validateIdentifier("committed decision intent id", payload.IntentID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("committed decision target workstream id", payload.TargetWorkstreamID); err != nil {
		return err
	}
	if err := validateCommittedDecisionTarget(fact); err != nil {
		return err
	}
	return validateTrimmedText("committed decision public summary", payload.PublicSummary)
}

// validateCommittedDecisionTarget requires the target the decision kind can act
// on, and the workstream the decision was made in. Work and selection name a
// target and happen in a workstream; a create names the workstream it minted
// and happens in no workstream, because it was decided before the workstream it
// created existed.
func validateCommittedDecisionTarget(fact DirectorFactEvent) error {
	payload := fact.DecisionCommitted
	switch payload.Decision {
	case DirectorDecisionCreateWorkstream:
		if payload.TargetWorkstreamID == nil {
			return fmt.Errorf("director fact %s decision %q requires a target workstream", fact.ID, payload.Decision)
		}
		if fact.WorkstreamID != nil {
			return fmt.Errorf(
				"director fact %s created workstream %s from inside workstream %s",
				fact.ID,
				*payload.TargetWorkstreamID,
				*fact.WorkstreamID,
			)
		}
		return nil
	case DirectorDecisionSendToWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun,
		DirectorDecisionSelectWorkstream:
		if payload.TargetWorkstreamID == nil {
			return fmt.Errorf("director fact %s decision %q requires a target workstream", fact.ID, payload.Decision)
		}
		return requireDecisionWorkstream(fact)
	default:
		// Recovery addresses a durable failure, so it always happens in the
		// workstream that failed.
		return requireDecisionWorkstream(fact)
	}
}

func requireDecisionWorkstream(fact DirectorFactEvent) error {
	if fact.WorkstreamID == nil {
		return fmt.Errorf(
			"director fact %s decision %q requires the workstream it happened in",
			fact.ID,
			fact.DecisionCommitted.Decision,
		)
	}
	return nil
}

func validateOpenedResourceRequest(fact DirectorFactEvent) error {
	payload := fact.ResourceRequestOpened
	if err := validateIdentifier("opened resource request id", payload.RequestID); err != nil {
		return err
	}
	if payload.Kind != WorkstreamResourceKindFolder {
		return fmt.Errorf("director fact %s opens an unknown resource kind %q", fact.ID, payload.Kind)
	}
	return validateTrimmedText("opened resource request public summary", payload.PublicSummary)
}

func validateResolvedResourceRequest(fact DirectorFactEvent) error {
	payload := fact.ResourceRequestResolved
	if err := validateIdentifier("resolved resource request id", payload.RequestID); err != nil {
		return err
	}
	if err := resourceRequestLifecycle.validateStatus(payload.Status); err != nil {
		return err
	}
	if payload.Status == ResourceRequestStatusRequested {
		return fmt.Errorf("director fact %s resolves a resource request to %q", fact.ID, payload.Status)
	}
	resolved := payload.Status == ResourceRequestStatusResolved
	if resolved != (payload.Binding != nil) {
		return fmt.Errorf("director fact %s must carry a binding when, and only when, the request resolved", fact.ID)
	}
	if payload.Binding == nil {
		return nil
	}
	return ValidateWorkstreamResourceBinding(*payload.Binding)
}

func validateAttemptedRecovery(fact DirectorFactEvent) error {
	payload := fact.RecoveryAttempted
	if err := validateIdentifier("attempted recovery id", payload.RecoveryID); err != nil {
		return err
	}
	if err := recoveryLifecycle.validateStatus(payload.Status); err != nil {
		return err
	}
	if err := validateIdentifier("attempted recovery failure event id", payload.FailureEventID); err != nil {
		return err
	}
	return validateTrimmedText("attempted recovery public summary", payload.PublicSummary)
}

func validateOptionalIdentifier(label string, value *string) error {
	if value == nil {
		return nil
	}
	return validateIdentifier(label, *value)
}

func isDirectorDecisionKind(kind DirectorDecisionKind) bool {
	for _, candidate := range directorDecisionKinds {
		if candidate == kind {
			return true
		}
	}
	return false
}
