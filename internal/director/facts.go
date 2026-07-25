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
// one submitted intent. The model chooses a kind and a target only from the ones
// trusted application state authorized; trusted product code attaches the ids.
type DirectorDecisionKind string

const (
	// DirectorDecisionAnswerDirectly answers from app-visible state without
	// starting work.
	DirectorDecisionAnswerDirectly DirectorDecisionKind = "answer_directly"
	// DirectorDecisionCreateWorkstream starts a new folderless or resource-bound
	// workstream.
	DirectorDecisionCreateWorkstream DirectorDecisionKind = "create_workstream"
	// DirectorDecisionSendToWorkstream sends work to an idle existing workstream.
	DirectorDecisionSendToWorkstream DirectorDecisionKind = "send_to_workstream"
	// DirectorDecisionQueueBehindRun queues work behind an active workstream.
	DirectorDecisionQueueBehindRun DirectorDecisionKind = "queue_behind_run"
	// DirectorDecisionSteerRun changes the instruction of an active run.
	DirectorDecisionSteerRun DirectorDecisionKind = "steer_run"
	// DirectorDecisionAskClarification asks a question whose answer can change
	// the outcome. It is a product action, never a schema repair path.
	DirectorDecisionAskClarification DirectorDecisionKind = "ask_clarification"
	// DirectorDecisionSelectWorkstream focuses an existing workstream.
	DirectorDecisionSelectWorkstream DirectorDecisionKind = "select_workstream"
	// DirectorDecisionRecoverPath retries or recovers a failed routing or
	// execution path that durable state proves is the right next action.
	DirectorDecisionRecoverPath DirectorDecisionKind = "recover_path"
)

var directorDecisionKinds = []DirectorDecisionKind{
	DirectorDecisionAnswerDirectly,
	DirectorDecisionCreateWorkstream,
	DirectorDecisionSendToWorkstream,
	DirectorDecisionQueueBehindRun,
	DirectorDecisionSteerRun,
	DirectorDecisionAskClarification,
	DirectorDecisionSelectWorkstream,
	DirectorDecisionRecoverPath,
}

// DirectorDecisionKinds returns the ordered decision catalog.
func DirectorDecisionKinds() []DirectorDecisionKind {
	return append([]DirectorDecisionKind(nil), directorDecisionKinds...)
}

// DirectorValidationOutcome is the durable result of validating a structured
// declaration before it caused any product effect.
type DirectorValidationOutcome string

const (
	DirectorValidationPassed DirectorValidationOutcome = "passed"
	DirectorValidationFailed DirectorValidationOutcome = "failed"
)

var directorValidationOutcomes = []DirectorValidationOutcome{
	DirectorValidationPassed,
	DirectorValidationFailed,
}

// DirectorWorkstreamRegistered admits a workstream to the app-scoped registry.
// The conversation it names is its execution substrate, not its identity.
type DirectorWorkstreamRegistered struct {
	Title          string                  `json:"title"`
	ConversationID string                  `json:"conversationId"`
	ParentID       *string                 `json:"parentId"`
	ResourceScope  WorkstreamResourceScope `json:"resourceScope"`
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
// validation. Nothing here is model-authored except the decision kind and the
// public summary.
type DirectorDecisionCommitted struct {
	Decision DirectorDecisionKind `json:"decision"`
	// IntentID is the submitted intent this decision answered. One intent
	// produces exactly one decision, so the id is what lets a later decision be
	// read as continuity rather than as an unrelated event.
	IntentID      string `json:"intentId"`
	PublicSummary string `json:"publicSummary"`
	// TargetWorkstreamID is the authorized target trusted code attached. It is
	// null for a decision that targets no workstream, such as a clarification.
	TargetWorkstreamID *string `json:"targetWorkstreamId"`
	// Clarification is populated exactly for a clarification decision.
	Clarification *DirectorClarificationAsked `json:"clarification"`
	// Answer is populated exactly for a direct answer.
	Answer *DirectorAnswerGiven `json:"answer"`
}

// DirectorAnswerGiven is the answer a direct-answer decision gave the user. It
// is durable for the same reason a clarification question is: it is the
// Director's half of the dialogue, and a restart that lost it would leave the
// user's request looking unanswered. It is deliberately not the decision's
// public summary, because the summary labels the graph and model-authored text
// never does.
type DirectorAnswerGiven struct {
	Text string `json:"text"`
}

// DirectorClarificationAsked is the question a clarification decision asked and
// the workstreams it was choosing between. Both are durable because the user's
// next intent is the answer: without the question a restart would ask again,
// and without the candidates the answer could be applied to a workstream the
// question never offered.
type DirectorClarificationAsked struct {
	Question               string   `json:"question"`
	CandidateWorkstreamIDs []string `json:"candidateWorkstreamIds"`
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

// DirectorInterpretationPublished is a public, attributable Director conclusion
// about facts the app already committed. It never carries private reasoning.
type DirectorInterpretationPublished struct {
	InterpretationID string                 `json:"interpretationId"`
	PublicSummary    string                 `json:"publicSummary"`
	Metadata         InterpretationMetadata `json:"metadata"`
	// InterpretedEventIDs are the durable events the conclusion was drawn from.
	// An interpretation with no sources is not attributable, so it is invalid.
	InterpretedEventIDs []string `json:"interpretedEventIds"`
}

// DirectorValidationRecorded is the durable outcome of checking a structured
// declaration before it took effect. It is what a validated_by edge is derived
// from, so validation is a visible typed fact rather than a silent retry.
type DirectorValidationRecorded struct {
	ValidationID string                    `json:"validationId"`
	Outcome      DirectorValidationOutcome `json:"outcome"`
	// SubjectEventID is the durable event whose declaration was validated.
	SubjectEventID string `json:"subjectEventId"`
	PublicSummary  string `json:"publicSummary"`
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
	// Director decision that happened in none: an answer and a clarification are
	// the Director talking to the user rather than work inside a workstream, and
	// a decision that started a root workstream was made before that workstream
	// existed. Every other fact belongs to a workstream, so omitting it fails.
	WorkstreamID *string `json:"workstreamId"`
	// RunID binds the fact to a durable run when one caused it, such as a
	// resource request opened by work that could not start.
	RunID                   *string                          `json:"runId"`
	Actor                   SemanticActor                    `json:"actor"`
	WorkstreamRegistered    *DirectorWorkstreamRegistered    `json:"workstreamRegistered"`
	WorkstreamSelected      *DirectorWorkstreamSelected      `json:"workstreamSelected"`
	WorkstreamResourceBound *DirectorWorkstreamResourceBound `json:"workstreamResourceBound"`
	DecisionCommitted       *DirectorDecisionCommitted       `json:"decisionCommitted"`
	ResourceRequestOpened   *DirectorResourceRequestOpened   `json:"resourceRequestOpened"`
	ResourceRequestResolved *DirectorResourceRequestResolved `json:"resourceRequestResolved"`
	InterpretationPublished *DirectorInterpretationPublished `json:"interpretationPublished"`
	ValidationRecorded      *DirectorValidationRecorded      `json:"validationRecorded"`
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

// validateDirectorFactWorkstream requires the workstream every fact but an
// app-scoped decision happens in. The payload is checked first, because whether
// a decision is app-scoped is a property of the decision it committed.
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
		DirectorFactWorkstreamRegistered:    fact.WorkstreamRegistered != nil,
		DirectorFactWorkstreamSelected:      fact.WorkstreamSelected != nil,
		DirectorFactWorkstreamResourceBound: fact.WorkstreamResourceBound != nil,
		DirectorFactDecisionCommitted:       fact.DecisionCommitted != nil,
		DirectorFactResourceRequestOpened:   fact.ResourceRequestOpened != nil,
		DirectorFactResourceRequestResolved: fact.ResourceRequestResolved != nil,
		DirectorFactInterpretationPublished: fact.InterpretationPublished != nil,
		DirectorFactValidationRecorded:      fact.ValidationRecorded != nil,
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
	case DirectorFactWorkstreamRegistered:
		return validateRegisteredWorkstream(fact)
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
	case DirectorFactInterpretationPublished:
		return validatePublishedInterpretation(fact)
	case DirectorFactValidationRecorded:
		return validateRecordedValidation(fact)
	case DirectorFactRecoveryAttempted:
		return validateAttemptedRecovery(fact)
	default:
		return fmt.Errorf("director fact %s has unknown kind %q", fact.ID, fact.Kind)
	}
}

func validateRegisteredWorkstream(fact DirectorFactEvent) error {
	payload := fact.WorkstreamRegistered
	if err := validateTrimmedText("registered workstream title", payload.Title); err != nil {
		return err
	}
	if err := validateIdentifier("registered workstream conversation id", payload.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("registered workstream parent id", payload.ParentID); err != nil {
		return err
	}
	if payload.ParentID != nil && *payload.ParentID == *fact.WorkstreamID {
		return fmt.Errorf("workstream %s cannot be its own parent", *fact.WorkstreamID)
	}
	return validateWorkstreamResourceScope(payload.ResourceScope)
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
	if err := validateCommittedClarification(fact); err != nil {
		return err
	}
	if err := validateCommittedAnswer(fact); err != nil {
		return err
	}
	if err := validateCommittedDecisionTarget(fact); err != nil {
		return err
	}
	return validateTrimmedText("committed decision public summary", payload.PublicSummary)
}

// validateCommittedDecisionTarget requires the target the decision kind can act
// on, and the workstream the decision was made in. Work and selection name a
// target and happen in a workstream; an answer and a question name neither; a
// create names the workstream it minted, and happens in the parent it delegated
// from or — for a root workstream — in none, because it was decided before the
// workstream it created existed.
func validateCommittedDecisionTarget(fact DirectorFactEvent) error {
	payload := fact.DecisionCommitted
	switch payload.Decision {
	case DirectorDecisionCreateWorkstream:
		if payload.TargetWorkstreamID == nil {
			return fmt.Errorf("director fact %s decision %q requires a target workstream", fact.ID, payload.Decision)
		}
		if fact.WorkstreamID != nil && *payload.TargetWorkstreamID == *fact.WorkstreamID {
			return fmt.Errorf("director fact %s cannot create its current workstream as a child", fact.ID)
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
	case DirectorDecisionAnswerDirectly, DirectorDecisionAskClarification:
		if payload.TargetWorkstreamID != nil {
			return fmt.Errorf("director fact %s decision %q must not target a workstream", fact.ID, payload.Decision)
		}
		if fact.WorkstreamID != nil {
			return fmt.Errorf("director fact %s decision %q must not happen in a workstream", fact.ID, payload.Decision)
		}
		return nil
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

// validateCommittedAnswer requires the answered text on exactly the decision
// that answered. Any other decision carrying one would claim to have answered a
// request it actually routed.
func validateCommittedAnswer(fact DirectorFactEvent) error {
	payload := fact.DecisionCommitted
	answer := payload.Answer
	if (answer != nil) != (payload.Decision == DirectorDecisionAnswerDirectly) {
		return fmt.Errorf(
			"director fact %s must carry an answer exactly for decision %q",
			fact.ID,
			DirectorDecisionAnswerDirectly,
		)
	}
	if answer == nil {
		return nil
	}
	if err := validateTrimmedText("committed answer text", answer.Text); err != nil {
		return err
	}
	if len(answer.Text) > MaxDecisionAnswerBytes {
		return fmt.Errorf("committed answer text exceeds %d bytes", MaxDecisionAnswerBytes)
	}
	return nil
}

// validateCommittedClarification requires the question and its candidates on
// exactly the decision that asked one. A clarification without them is a
// question the app cannot resume, and any other decision carrying them would
// claim to be waiting for an answer it never asked for.
func validateCommittedClarification(fact DirectorFactEvent) error {
	payload := fact.DecisionCommitted
	clarification := payload.Clarification
	if (clarification != nil) != (payload.Decision == DirectorDecisionAskClarification) {
		return fmt.Errorf(
			"director fact %s must carry a clarification exactly for decision %q",
			fact.ID,
			DirectorDecisionAskClarification,
		)
	}
	if clarification == nil {
		return nil
	}
	if err := validateTrimmedText("committed clarification question", clarification.Question); err != nil {
		return err
	}
	if len(clarification.Question) > MaxDecisionQuestionBytes {
		return fmt.Errorf("committed clarification question exceeds %d bytes", MaxDecisionQuestionBytes)
	}
	if clarification.CandidateWorkstreamIDs == nil {
		return fmt.Errorf("director fact %s clarification candidates must be an array, not null", fact.ID)
	}
	if len(clarification.CandidateWorkstreamIDs) > MaxDecisionWorkstreamTargets {
		return fmt.Errorf(
			"director fact %s clarification offers more than %d candidates",
			fact.ID,
			MaxDecisionWorkstreamTargets,
		)
	}
	seen := map[string]bool{}
	for _, candidate := range clarification.CandidateWorkstreamIDs {
		if err := validateIdentifier("committed clarification candidate workstream id", candidate); err != nil {
			return err
		}
		if seen[candidate] {
			return fmt.Errorf("director fact %s repeats clarification candidate %s", fact.ID, candidate)
		}
		seen[candidate] = true
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

func validatePublishedInterpretation(fact DirectorFactEvent) error {
	payload := fact.InterpretationPublished
	if err := validateIdentifier("published interpretation id", payload.InterpretationID); err != nil {
		return err
	}
	if err := validateTrimmedText("published interpretation public summary", payload.PublicSummary); err != nil {
		return err
	}
	if err := requireSourceEventIDs("published interpretation", payload.InterpretedEventIDs); err != nil {
		return err
	}
	if payload.Metadata.InterpretedBy != fact.Actor {
		return fmt.Errorf("director fact %s attributes its interpretation to %q but is actored by %q",
			fact.ID, payload.Metadata.InterpretedBy, fact.Actor)
	}
	if err := validateInterpretationMetadata(fact.ID, payload.Metadata); err != nil {
		return err
	}
	return validateTimestampOrder(
		fmt.Sprintf("director fact %s interpretation timestamp", fact.ID),
		payload.Metadata.InterpretedAt,
		fact.EmittedAt,
	)
}

func validateRecordedValidation(fact DirectorFactEvent) error {
	payload := fact.ValidationRecorded
	if err := validateIdentifier("recorded validation id", payload.ValidationID); err != nil {
		return err
	}
	if !isDirectorValidationOutcome(payload.Outcome) {
		return fmt.Errorf("director fact %s has unknown validation outcome %q", fact.ID, payload.Outcome)
	}
	if err := validateIdentifier("recorded validation subject event id", payload.SubjectEventID); err != nil {
		return err
	}
	return validateTrimmedText("recorded validation public summary", payload.PublicSummary)
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

func isDirectorValidationOutcome(outcome DirectorValidationOutcome) bool {
	for _, candidate := range directorValidationOutcomes {
		if candidate == outcome {
			return true
		}
	}
	return false
}
