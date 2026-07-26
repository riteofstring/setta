package director

import (
	"fmt"
	"slices"
)

// The trusted state that bounds a Director decision.
//
// Everything a Setta tool may name comes from here, and nothing here is
// provider-authored. A target's AllowedDecisionKinds is the only action
// authority it carries; its recoverable failures are the only ids a recover
// action may reference. Every tool call is validated against this context
// immediately before trusted code executes it.

const (
	// MaxDecisionWorkstreamTargets bounds the authoritative tool target set.
	MaxDecisionWorkstreamTargets = 24
	// MaxDecisionWorkspaceOptions bounds the folder resources a new workstream
	// may be scoped to.
	MaxDecisionWorkspaceOptions = 64
	// MaxDecisionRecoverableFailuresPerTarget bounds the durable failures one
	// workstream offers for recovery.
	MaxDecisionRecoverableFailuresPerTarget = 8
	// MaxRecentDecisionSummaries bounds the decision history supplied as
	// continuity context.
	MaxRecentDecisionSummaries = 8
)

// DecisionWorkspaceOption is one folder resource a new root workstream may be
// scoped to. The name is context for the Director; the id is the only value a
// tool call may echo back.
type DecisionWorkspaceOption struct {
	WorkspaceID   string `json:"workspaceId"`
	WorkspaceName string `json:"workspaceName"`
}

// DecisionRecoverableFailure is one durable failure a workstream offers for
// recovery. The summary is the public one already committed with the failure,
// so a recovery decision never reads raw provider text.
type DecisionRecoverableFailure struct {
	FailureEventID string `json:"failureEventId"`
	PublicSummary  string `json:"publicSummary"`
	OccurredAt     string `json:"occurredAt"`
}

// DecisionMilestone is the last meaningful public fact of one workstream, told
// to the Director so it can tell active work apart from stalled work. It is
// WorkstreamMilestone without the graph node id: a node id is a renderer
// identity, and an id the Director can echo back into a decision it does not
// authorize is authority the context never meant to hand over.
type DecisionMilestone struct {
	Kind          SemanticNodeKind `json:"kind"`
	PublicSummary string           `json:"publicSummary"`
	OccurredAt    string           `json:"occurredAt"`
}

// WorkstreamDecisionTarget is authoritative capability state for one
// workstream the Director may act on. It carries no pane, provider, lease, or
// filesystem identity.
type WorkstreamDecisionTarget struct {
	WorkstreamID   string                `json:"workstreamId"`
	Title          string                `json:"title"`
	Status         WorkstreamStatus      `json:"status"`
	ResourceScope  DecisionResourceScope `json:"resourceScope"`
	ActiveRunID    *string               `json:"activeRunId"`
	QueuedRunCount int                   `json:"queuedRunCount"`
	// ForkPointRunID is the completed run a fork of this workstream would
	// branch from, or null when it has completed none. It is the evidence that
	// makes fork_workstream an authorized decision, the same way a recoverable
	// failure is what makes recover_path one.
	ForkPointRunID *string            `json:"forkPointRunId"`
	LastMilestone  *DecisionMilestone `json:"lastMilestone"`
	// Narration is the narrator's own account of this workstream's work,
	// newest last. It is what lets the Director answer a question about a
	// conversation with something other than its status.
	Narration []WorkstreamNarration `json:"narration"`
	// AllowedDecisionKinds is the only action authority this target carries. It
	// holds workstream-scoped kinds only: creating a workstream is app-scoped
	// authority, because every workstream the Director creates is independent.
	AllowedDecisionKinds []DirectorDecisionKind       `json:"allowedDecisionKinds"`
	RecoverableFailures  []DecisionRecoverableFailure `json:"recoverableFailures"`
}

// DecisionSummary is one prior decision supplied as continuity context.
type DecisionSummary struct {
	IntentID           string               `json:"intentId"`
	Decision           DirectorDecisionKind `json:"decision"`
	TargetWorkstreamID *string              `json:"targetWorkstreamId"`
	DecidedAt          string               `json:"decidedAt"`
}

// DirectorDecisionContext is the complete authoritative context for one
// decision.
type DirectorDecisionContext struct {
	Intent          SubmittedIntent            `json:"intent"`
	SelectedID      *string                    `json:"selectedWorkstreamId"`
	Workspaces      []DecisionWorkspaceOption  `json:"workspaces"`
	Workstreams     []WorkstreamDecisionTarget `json:"workstreams"`
	RecentDecisions []DecisionSummary          `json:"recentDecisions"`
	// AllowedDecisionKinds is the catalog subset a tool call may commit. Every
	// workstream-scoped kind here is allowed by at least one target, so a call
	// can never name an action no workstream offers.
	AllowedDecisionKinds []DirectorDecisionKind `json:"allowedDecisionKinds"`
}

// workstreamScopedDecisionKinds act on one existing workstream.
var workstreamScopedDecisionKinds = []DirectorDecisionKind{
	DirectorDecisionSendToWorkstream,
	DirectorDecisionQueueBehindRun,
	DirectorDecisionSteerRun,
	DirectorDecisionForkWorkstream,
	DirectorDecisionSelectWorkstream,
	DirectorDecisionRecoverPath,
}

func isWorkstreamScopedDecisionKind(kind DirectorDecisionKind) bool {
	return slices.Contains(workstreamScopedDecisionKinds, kind)
}

// Validate rejects a context trusted product code could not have produced.
func (context DirectorDecisionContext) Validate() error {
	if err := validateSubmittedIntent(context.Intent); err != nil {
		return err
	}
	if err := context.validateCollections(); err != nil {
		return err
	}
	if err := context.validateAllowedKinds(); err != nil {
		return err
	}
	return context.validateReferences()
}

func (context DirectorDecisionContext) validateCollections() error {
	if context.Workspaces == nil || context.Workstreams == nil ||
		context.RecentDecisions == nil || context.AllowedDecisionKinds == nil {
		return fmt.Errorf("director decision context collections must be arrays, not null")
	}
	if len(context.Workspaces) > MaxDecisionWorkspaceOptions {
		return fmt.Errorf("director decision context offers more than %d workspaces", MaxDecisionWorkspaceOptions)
	}
	if len(context.Workstreams) > MaxDecisionWorkstreamTargets {
		return fmt.Errorf("director decision context offers more than %d workstreams", MaxDecisionWorkstreamTargets)
	}
	if len(context.RecentDecisions) > MaxRecentDecisionSummaries {
		return fmt.Errorf("director decision context carries more than %d recent decisions", MaxRecentDecisionSummaries)
	}
	if err := validateDecisionWorkspaces(context.Workspaces); err != nil {
		return err
	}
	if err := validateDecisionTargets(context.Workstreams); err != nil {
		return err
	}
	return validateRecentDecisionSummaries(context.RecentDecisions)
}

func (context DirectorDecisionContext) validateAllowedKinds() error {
	if len(context.AllowedDecisionKinds) == 0 {
		return fmt.Errorf("director decision context allows no decision")
	}
	seen := map[DirectorDecisionKind]bool{}
	for _, kind := range context.AllowedDecisionKinds {
		if !isDirectorDecisionKind(kind) {
			return fmt.Errorf("director decision context allows unknown kind %q", kind)
		}
		if seen[kind] {
			return fmt.Errorf("director decision context repeats decision kind %q", kind)
		}
		seen[kind] = true
	}
	for _, kind := range workstreamScopedDecisionKinds {
		if seen[kind] && len(context.targetsAllowing(kind)) == 0 {
			return fmt.Errorf("director decision context allows %q with no authorized workstream", kind)
		}
	}
	return context.validateTargetKindsAreAllowed(seen)
}

func (context DirectorDecisionContext) validateTargetKindsAreAllowed(allowed map[DirectorDecisionKind]bool) error {
	for _, target := range context.Workstreams {
		for _, kind := range target.AllowedDecisionKinds {
			if !allowed[kind] {
				return fmt.Errorf("workstream %s allows %q the context does not", target.WorkstreamID, kind)
			}
		}
	}
	return nil
}

func (context DirectorDecisionContext) validateReferences() error {
	known := map[string]bool{}
	for _, target := range context.Workstreams {
		if known[target.WorkstreamID] {
			return fmt.Errorf("director decision context repeats workstream %s", target.WorkstreamID)
		}
		known[target.WorkstreamID] = true
	}
	if context.SelectedID != nil && !known[*context.SelectedID] {
		return fmt.Errorf("director decision context selects unlisted workstream %s", *context.SelectedID)
	}
	for _, summary := range context.RecentDecisions {
		if summary.TargetWorkstreamID != nil && !known[*summary.TargetWorkstreamID] {
			return fmt.Errorf("recent decision references unlisted workstream %s", *summary.TargetWorkstreamID)
		}
	}
	return nil
}

func validateSubmittedIntent(intent SubmittedIntent) error {
	if err := validateIdentifier("director decision intent id", intent.ID); err != nil {
		return err
	}
	if err := validateTrimmedText("director decision intent text", intent.Text); err != nil {
		return err
	}
	if len(intent.Text) > MaxDecisionIntentTextBytes {
		return fmt.Errorf("director decision intent text exceeds %d bytes", MaxDecisionIntentTextBytes)
	}
	if !isDecisionIntentModality(intent.Modality) {
		return fmt.Errorf("unknown director decision intent modality %q", intent.Modality)
	}
	return validateTimestamp("director decision intent submitted at", intent.SubmittedAt)
}

func validateDecisionWorkspaces(workspaces []DecisionWorkspaceOption) error {
	seen := map[string]bool{}
	for _, workspace := range workspaces {
		if err := validateIdentifier("decision workspace id", workspace.WorkspaceID); err != nil {
			return err
		}
		if seen[workspace.WorkspaceID] {
			return fmt.Errorf("director decision context repeats workspace %s", workspace.WorkspaceID)
		}
		seen[workspace.WorkspaceID] = true
		if err := validateTrimmedText("decision workspace name", workspace.WorkspaceName); err != nil {
			return err
		}
	}
	return nil
}

func validateDecisionTargets(targets []WorkstreamDecisionTarget) error {
	for _, target := range targets {
		if err := target.Validate(); err != nil {
			return err
		}
	}
	return nil
}

// Validate rejects a target whose offered authority contradicts its own state.
func (target WorkstreamDecisionTarget) Validate() error {
	if err := target.validateIdentity(); err != nil {
		return err
	}
	if err := target.validateAllowedKinds(); err != nil {
		return err
	}
	return validateDecisionRecoverableFailures(target)
}

func (target WorkstreamDecisionTarget) validateIdentity() error {
	if err := validateIdentifier("decision target workstream id", target.WorkstreamID); err != nil {
		return err
	}
	if err := validateBoundedExcerpt("decision target title", target.Title); err != nil {
		return err
	}
	if !isWorkstreamStatus(target.Status) {
		return fmt.Errorf("unknown decision target status %q", target.Status)
	}
	if target.Status == WorkstreamStatusArchived {
		return fmt.Errorf("archived workstream %s is not a routing target", target.WorkstreamID)
	}
	if err := validateDecisionResourceScope(target.ResourceScope); err != nil {
		return err
	}
	if target.ActiveRunID != nil {
		if err := validateIdentifier("decision target active run id", *target.ActiveRunID); err != nil {
			return err
		}
	}
	if target.ForkPointRunID != nil {
		if err := validateIdentifier("decision target fork point run id", *target.ForkPointRunID); err != nil {
			return err
		}
	}
	if err := validateCount("decision target queued run count", target.QueuedRunCount); err != nil {
		return err
	}
	return validateDecisionMilestone(target.LastMilestone)
}

func validateDecisionMilestone(milestone *DecisionMilestone) error {
	if milestone == nil {
		return nil
	}
	if !isSemanticNodeKind(milestone.Kind) {
		return fmt.Errorf("unknown decision milestone node kind %q", milestone.Kind)
	}
	if err := validateBoundedExcerpt("decision milestone public summary", milestone.PublicSummary); err != nil {
		return err
	}
	return validateTimestamp("decision milestone occurred at", milestone.OccurredAt)
}

func (target WorkstreamDecisionTarget) validateAllowedKinds() error {
	if len(target.AllowedDecisionKinds) == 0 {
		return fmt.Errorf("decision target %s allows no decision", target.WorkstreamID)
	}
	seen := map[DirectorDecisionKind]bool{}
	for _, kind := range target.AllowedDecisionKinds {
		if !isWorkstreamScopedDecisionKind(kind) {
			return fmt.Errorf("decision target %s carries non-workstream kind %q", target.WorkstreamID, kind)
		}
		if seen[kind] {
			return fmt.Errorf("decision target %s repeats decision kind %q", target.WorkstreamID, kind)
		}
		seen[kind] = true
	}
	if !seen[DirectorDecisionSelectWorkstream] {
		return fmt.Errorf("decision target %s must allow selection", target.WorkstreamID)
	}
	return target.validateRunStateAuthority(seen)
}

func (target WorkstreamDecisionTarget) validateRunStateAuthority(allowed map[DirectorDecisionKind]bool) error {
	running := target.ActiveRunID != nil
	idleForDelivery := !running &&
		target.QueuedRunCount == 0 &&
		target.Status != WorkstreamStatusAwaitingResource
	if allowed[DirectorDecisionSendToWorkstream] != idleForDelivery {
		return fmt.Errorf(
			"decision target %s must offer send exactly when it is idle and deliverable",
			target.WorkstreamID,
		)
	}
	for _, kind := range []DirectorDecisionKind{DirectorDecisionQueueBehindRun, DirectorDecisionSteerRun} {
		if allowed[kind] != running {
			return fmt.Errorf(
				"decision target %s must offer %q exactly while a run is active",
				target.WorkstreamID,
				kind,
			)
		}
	}
	if allowed[DirectorDecisionForkWorkstream] != (target.ForkPointRunID != nil) {
		return fmt.Errorf(
			"decision target %s must offer forking exactly when it has a completed run to branch from",
			target.WorkstreamID,
		)
	}
	if allowed[DirectorDecisionRecoverPath] !=
		(idleForDelivery && len(target.RecoverableFailures) > 0) {
		return fmt.Errorf(
			"decision target %s must offer recovery exactly when a failure is recoverable and no work is active or queued",
			target.WorkstreamID,
		)
	}
	return nil
}

func validateDecisionRecoverableFailures(target WorkstreamDecisionTarget) error {
	if target.RecoverableFailures == nil {
		return fmt.Errorf("decision target %s recoverable failures must be an array, not null", target.WorkstreamID)
	}
	if len(target.RecoverableFailures) > MaxDecisionRecoverableFailuresPerTarget {
		return fmt.Errorf("decision target %s offers more than %d recoverable failures",
			target.WorkstreamID, MaxDecisionRecoverableFailuresPerTarget)
	}
	seen := map[string]bool{}
	for _, failure := range target.RecoverableFailures {
		if err := validateIdentifier("decision recoverable failure event id", failure.FailureEventID); err != nil {
			return err
		}
		if seen[failure.FailureEventID] {
			return fmt.Errorf("decision target %s repeats failure %s", target.WorkstreamID, failure.FailureEventID)
		}
		seen[failure.FailureEventID] = true
		if err := validateBoundedExcerpt("decision recoverable failure summary", failure.PublicSummary); err != nil {
			return err
		}
		if err := validateTimestamp("decision recoverable failure occurred at", failure.OccurredAt); err != nil {
			return err
		}
	}
	return nil
}

func validateRecentDecisionSummaries(summaries []DecisionSummary) error {
	for _, summary := range summaries {
		if err := validateIdentifier("recent decision intent id", summary.IntentID); err != nil {
			return err
		}
		if !isDirectorDecisionKind(summary.Decision) {
			return fmt.Errorf("recent decision has unknown kind %q", summary.Decision)
		}
		if err := validateOptionalIdentifier("recent decision target workstream id", summary.TargetWorkstreamID); err != nil {
			return err
		}
		if err := validateTimestamp("recent decision decided at", summary.DecidedAt); err != nil {
			return err
		}
	}
	return nil
}

func validateBoundedExcerpt(label string, value string) error {
	if err := validateTrimmedText(label, value); err != nil {
		return err
	}
	if len(value) > MaxDecisionExcerptBytes {
		return fmt.Errorf("%s exceeds %d bytes", label, MaxDecisionExcerptBytes)
	}
	return nil
}

// Target returns the authoritative record for one workstream id.
func (context DirectorDecisionContext) Target(workstreamID string) (WorkstreamDecisionTarget, bool) {
	for _, target := range context.Workstreams {
		if target.WorkstreamID == workstreamID {
			return target, true
		}
	}
	return WorkstreamDecisionTarget{}, false
}

func (context DirectorDecisionContext) targetsAllowing(kind DirectorDecisionKind) []WorkstreamDecisionTarget {
	matched := make([]WorkstreamDecisionTarget, 0, len(context.Workstreams))
	for _, target := range context.Workstreams {
		if slices.Contains(target.AllowedDecisionKinds, kind) {
			matched = append(matched, target)
		}
	}
	return matched
}

func (context DirectorDecisionContext) allowsKind(kind DirectorDecisionKind) bool {
	return slices.Contains(context.AllowedDecisionKinds, kind)
}
