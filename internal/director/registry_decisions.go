package director

import (
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"setta/internal/conversation"
)

// Materializing the trusted context one Director decision is bounded by.
//
// The tool catalog states what the Director may ask Setta to do; this is where
// the app answers what it may do it to. Every value here is folded from the
// durable log — the workstreams that exist, which of them is running, which
// failures nothing recovered, and what the Director already did — so tool
// authority is the same durable truth the rest of the command center renders.
//
// Nothing provider-authored reaches this file. A folder is offered as a
// workspace id the app can currently reach, never as a path, and every id a
// tool call may echo back already exists here.

// recordRunFailure records the durable failure a recovery decision may name.
// The public failure message is the only failure text that crosses this
// boundary; the diagnostic reference stays behind the detail surfaces.
func (workstream *registryWorkstream) recordRunFailure(event conversation.TrajectoryEvent) error {
	if event.TurnFailed == nil {
		return missingPayload(event)
	}
	if event.TurnID == nil {
		// A failure that interrupted no run has no work to restart, so offering
		// to recover it would put an action in front of the user that trusted
		// code could not carry out.
		return nil
	}
	summary := boundDecisionExcerpt(firstText(event.TurnFailed.Failure.Message, failedRunSummary))
	for _, existing := range workstream.recoverableFailures {
		if existing.FailureEventID == event.ID {
			return fmt.Errorf("run failure %s was recorded twice", event.ID)
		}
	}
	workstream.recoverableFailures = append(workstream.recoverableFailures, DecisionRecoverableFailure{
		FailureEventID: event.ID,
		PublicSummary:  summary,
		OccurredAt:     event.EmittedAt,
	})
	workstream.failureRuns[event.ID] = *event.TurnID
	return nil
}

// resolveRunFailure drops the failure a recovery attempt addressed, so one
// failure is recovered once.
func (workstream *registryWorkstream) resolveRunFailure(failureEventID string) {
	remaining := make([]DecisionRecoverableFailure, 0, len(workstream.recoverableFailures))
	for _, failure := range workstream.recoverableFailures {
		if failure.FailureEventID != failureEventID {
			remaining = append(remaining, failure)
		}
	}
	workstream.recoverableFailures = remaining
	delete(workstream.failureRuns, failureEventID)
}

// recordCommittedDecision folds one durable decision into the continuity the
// next tool call is authorized against.
func (state *registryState) recordCommittedDecision(fact DirectorFactEvent) {
	payload := fact.DecisionCommitted
	summary := DecisionSummary{
		IntentID:           payload.IntentID,
		Decision:           payload.Decision,
		TargetWorkstreamID: copyOptionalString(payload.TargetWorkstreamID),
		DecidedAt:          fact.EmittedAt,
	}
	state.decisions = append(state.decisions, summary)
	if len(state.decisions) > MaxRecentDecisionSummaries {
		state.decisions = append([]DecisionSummary(nil), state.decisions[len(state.decisions)-MaxRecentDecisionSummaries:]...)
	}
}

// DecisionContext materializes the trusted context for one submitted intent.
// The registry is the only authority: a target the Director cannot see here is
// not returned by a listing tool, and a call naming one is rejected against
// this same context.
func (registry *Registry) DecisionContext(intent SubmittedIntent) (DirectorDecisionContext, error) {
	if err := validateSubmittedIntent(intent); err != nil {
		return DirectorDecisionContext{}, err
	}
	if err := registry.requireAvailable(); err != nil {
		return DirectorDecisionContext{}, err
	}
	// The offerable folders come from outside the durable log, so they are read
	// before the fold is locked rather than while it is held.
	workspaces, err := registry.workspaceOptions()
	if err != nil {
		return DirectorDecisionContext{}, err
	}
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if err := registry.requireAvailableLocked(); err != nil {
		return DirectorDecisionContext{}, err
	}
	return registry.state.decisionContext(intent, workspaces)
}

// workspaceOptions offers the folders the app can reach right now. A folder a
// workstream is already bound to stays resolvable through the durable lookup
// even when it is not offerable, because closing a folder does not unbind the
// work that ran in it.
func (registry *Registry) workspaceOptions() ([]DecisionWorkspaceOption, error) {
	if registry.workspaces == nil {
		return nil, fmt.Errorf("director registry requires workspace resources to offer folder scopes")
	}
	summaries, err := registry.workspaces.AvailableWorkspaces()
	if err != nil {
		return nil, err
	}
	options := make([]DecisionWorkspaceOption, 0, len(summaries))
	for _, summary := range summaries {
		if len(options) == MaxDecisionWorkspaceOptions {
			break
		}
		// The name is the only thing about a folder the Director sees. Its path
		// stays behind the binding trusted code resolves the chosen id into.
		name := boundDecisionExcerpt(summary.DisplayName)
		if summary.ID == "" || name == "" {
			return nil, fmt.Errorf("workspace %q cannot be offered without an id and a display name", summary.ID)
		}
		options = append(options, DecisionWorkspaceOption{WorkspaceID: summary.ID, WorkspaceName: name})
	}
	return options, nil
}

// DirectorActivity is what the app is doing right now, beyond the workstreams
// themselves: the app-wide counts, and the two things that are waiting on
// somebody. It is bounded the way the snapshot's rails are, because the answer
// to "what is happening?" must not grow with the profile.
type DirectorActivity struct {
	Aggregates           DirectorAggregates
	PendingApprovals     []ApprovalRequest
	OpenResourceRequests []ResourceRequest
}

// Activity reads the app-wide activity under one lock, so the counts and the
// outstanding requests beside them describe the same moment.
func (registry *Registry) Activity() (DirectorActivity, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if err := registry.requireAvailableLocked(); err != nil {
		return DirectorActivity{}, err
	}
	state := registry.state
	activity := DirectorActivity{
		Aggregates:           state.aggregates,
		PendingApprovals:     make([]ApprovalRequest, 0, MaxSnapshotApprovals),
		OpenResourceRequests: make([]ResourceRequest, 0, MaxSnapshotResourceRequests),
	}
	for _, approvalID := range state.approvalOrder {
		record, known := state.approvals[approvalID]
		if !known || record.Status != ApprovalStatusPending {
			continue
		}
		if len(activity.PendingApprovals) == MaxSnapshotApprovals {
			break
		}
		activity.PendingApprovals = append(activity.PendingApprovals, cloneApprovalRequest(*record))
	}
	for _, requestID := range state.resourceOrder {
		record, known := state.resources[requestID]
		if !known || record.Status != ResourceRequestStatusRequested {
			continue
		}
		if len(activity.OpenResourceRequests) == MaxSnapshotResourceRequests {
			break
		}
		activity.OpenResourceRequests = append(activity.OpenResourceRequests, cloneResourceRequest(*record))
	}
	return activity, nil
}

func (state *registryState) decisionContext(
	intent SubmittedIntent,
	workspaces []DecisionWorkspaceOption,
) (DirectorDecisionContext, error) {
	window := state.decisionWindow()
	targets := make([]WorkstreamDecisionTarget, 0, len(window))
	listed := make(map[string]bool, len(window))
	for _, workstream := range window {
		target, err := workstream.decisionTarget()
		if err != nil {
			return DirectorDecisionContext{}, err
		}
		targets = append(targets, target)
		listed[target.WorkstreamID] = true
	}
	context := DirectorDecisionContext{
		Intent:               intent,
		SelectedID:           listedSelection(state.selected, listed),
		Workspaces:           workspaces,
		Workstreams:          targets,
		RecentDecisions:      listedDecisions(state.decisions, listed),
		AllowedDecisionKinds: allowedDecisionKinds(targets),
	}
	if err := context.Validate(); err != nil {
		return DirectorDecisionContext{}, fmt.Errorf("materialize director decision context: %w", err)
	}
	return context, nil
}

// decisionWindow bounds the tool target set by recency. Archived workstreams
// are excluded because they are not active targets, and the selected workstream
// is always inside the window: the user is looking at it, so it must be
// somewhere the Director can send their next request.
func (state *registryState) decisionWindow() []*registryWorkstream {
	return boundWorkstreamWindow(
		state.activeRecencyOrdered(),
		MaxDecisionWorkstreamTargets,
		state.activeSelection(),
	)
}

// decisionTarget derives one target's authority from what is durably true. The
// allowed kinds are a function of run state, not a claim: an idle workstream
// can be sent work and a running one cannot, so an authority set that
// contradicts its own state cannot be built here.
func (workstream *registryWorkstream) decisionTarget() (WorkstreamDecisionTarget, error) {
	record := workstream.record
	scope, err := decisionScopeFor(record.ResourceScope)
	if err != nil {
		return WorkstreamDecisionTarget{}, err
	}
	failures := recentDecisionFailures(workstream.recoverableFailures)
	target := WorkstreamDecisionTarget{
		WorkstreamID:         record.ID,
		Title:                boundDecisionExcerpt(record.Title),
		Status:               record.Status,
		ResourceScope:        scope,
		ActiveRunID:          copyOptionalString(record.ActiveRunID),
		QueuedRunCount:       record.QueuedRunCount,
		LastMilestone:        decisionMilestoneFor(record.LastMilestone),
		AllowedDecisionKinds: targetDecisionKinds(record, failures),
		RecoverableFailures:  failures,
	}
	if err := target.Validate(); err != nil {
		return WorkstreamDecisionTarget{}, fmt.Errorf("materialize decision target %s: %w", record.ID, err)
	}
	return target, nil
}

// targetDecisionKinds is the whole action authority one workstream carries.
// Selection is always available because every workstream the Director can see
// is one the user can be shown.
func targetDecisionKinds(record Workstream, failures []DecisionRecoverableFailure) []DirectorDecisionKind {
	kinds := []DirectorDecisionKind{DirectorDecisionSelectWorkstream}
	idleForDelivery := record.ActiveRunID == nil &&
		record.QueuedRunCount == 0 &&
		record.UnresolvedResourceRequestCount == 0
	if idleForDelivery {
		kinds = append(kinds, DirectorDecisionSendToWorkstream)
	} else if record.ActiveRunID != nil {
		kinds = append(kinds, DirectorDecisionQueueBehindRun, DirectorDecisionSteerRun)
	}
	if idleForDelivery && len(failures) > 0 {
		kinds = append(kinds, DirectorDecisionRecoverPath)
	}
	return kinds
}

// allowedDecisionKinds is the catalog subset this app state authorizes.
// Creating needs no target, because the workstream it makes does not exist yet.
// Every other kind acts on work the registry already holds.
func allowedDecisionKinds(targets []WorkstreamDecisionTarget) []DirectorDecisionKind {
	offered := map[DirectorDecisionKind]bool{}
	for _, target := range targets {
		for _, kind := range target.AllowedDecisionKinds {
			offered[kind] = true
		}
	}
	kinds := []DirectorDecisionKind{DirectorDecisionCreateWorkstream}
	for _, kind := range workstreamScopedDecisionKinds {
		if offered[kind] {
			kinds = append(kinds, kind)
		}
	}
	return kinds
}

func decisionScopeFor(scope WorkstreamResourceScope) (DecisionResourceScope, error) {
	switch scope.Kind {
	case WorkstreamResourceScopeFolderless:
		return DecisionResourceScope{Kind: WorkstreamResourceScopeFolderless}, nil
	case WorkstreamResourceScopeFolder:
		if scope.Folder == nil {
			return DecisionResourceScope{}, fmt.Errorf("folder workstream scope requires a folder binding")
		}
		return DecisionResourceScope{
			Kind:   WorkstreamResourceScopeFolder,
			Folder: &DecisionFolderResource{WorkspaceID: scope.Folder.WorkspaceID},
		}, nil
	default:
		return DecisionResourceScope{}, fmt.Errorf("unknown workstream resource scope kind %q", scope.Kind)
	}
}

// listedSelection reports the selection only when it is a target the context
// carries, because a context that selects a workstream it does not offer names
// an id nothing authorizes.
func listedSelection(selected *string, listed map[string]bool) *string {
	if selected == nil || !listed[*selected] {
		return nil
	}
	return copyOptionalString(selected)
}

// listedDecisions keeps the continuity history honest: a decision whose target
// left the window is dropped rather than rewritten as targetless, which would
// report a decision that never happened.
func listedDecisions(decisions []DecisionSummary, listed map[string]bool) []DecisionSummary {
	summaries := make([]DecisionSummary, 0, len(decisions))
	for _, decision := range decisions {
		if decision.TargetWorkstreamID != nil && !listed[*decision.TargetWorkstreamID] {
			continue
		}
		summary := decision
		summary.TargetWorkstreamID = copyOptionalString(decision.TargetWorkstreamID)
		summaries = append(summaries, summary)
	}
	return summaries
}

func recentDecisionFailures(failures []DecisionRecoverableFailure) []DecisionRecoverableFailure {
	if len(failures) > MaxDecisionRecoverableFailuresPerTarget {
		failures = failures[len(failures)-MaxDecisionRecoverableFailuresPerTarget:]
	}
	return append([]DecisionRecoverableFailure{}, failures...)
}

// decisionMilestoneFor drops the milestone's graph node id. The Director is
// told what last happened, not where the renderer drew it.
func decisionMilestoneFor(milestone *WorkstreamMilestone) *DecisionMilestone {
	if milestone == nil {
		return nil
	}
	return &DecisionMilestone{
		Kind:          milestone.Kind,
		PublicSummary: boundDecisionExcerpt(milestone.PublicSummary),
		OccurredAt:    milestone.OccurredAt,
	}
}

// boundDecisionExcerpt fits text into the context's excerpt bound without
// rewriting it. The durable record still owns the full text, so truncation
// costs the model detail and never changes what the app believes.
func boundDecisionExcerpt(text string) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) <= MaxDecisionExcerptBytes {
		return trimmed
	}
	cut := MaxDecisionExcerptBytes - len(decisionExcerptEllipsis)
	for cut > 0 && !utf8.RuneStart(trimmed[cut]) {
		cut--
	}
	return strings.TrimSpace(trimmed[:cut]) + decisionExcerptEllipsis
}

const decisionExcerptEllipsis = "…"

// recencyOrdered orders the registry by last change, newest first. Both the
// snapshot and the decision context bound their window this way, because the
// work the user touched last is the work their next request is most likely
// about.
func (state *registryState) recencyOrdered() []*registryWorkstream {
	ordered := make([]*registryWorkstream, 0, len(state.order))
	for _, workstreamID := range state.order {
		if workstream, known := state.workstreams[workstreamID]; known {
			ordered = append(ordered, workstream)
		}
	}
	sort.SliceStable(ordered, func(left, right int) bool {
		leftRecord := ordered[left].record
		rightRecord := ordered[right].record
		if leftRecord.UpdatedAt != rightRecord.UpdatedAt {
			return leftRecord.UpdatedAt > rightRecord.UpdatedAt
		}
		return leftRecord.ID < rightRecord.ID
	})
	return ordered
}

// activeRecencyOrdered is the work the command center still offers. Archived
// workstreams stay in the durable registry for history, but they no longer
// occupy navigation, routing, or snapshot capacity.
func (state *registryState) activeRecencyOrdered() []*registryWorkstream {
	active := make([]*registryWorkstream, 0, len(state.order))
	for _, workstream := range state.recencyOrdered() {
		if state.isActiveWorkstream(workstream) {
			active = append(active, workstream)
		}
	}
	return active
}

func (state *registryState) isActiveWorkstream(workstream *registryWorkstream) bool {
	return workstream != nil &&
		!workstream.archived &&
		workstream.record.Status != WorkstreamStatusArchived
}

// activeSelection projects durable selection onto active navigation. Archiving
// keeps history, including the last selection fact, without leaving the shell
// claiming that a retired workstream is still selected.
func (state *registryState) activeSelection() *string {
	if state.selected == nil {
		return nil
	}
	workstream, known := state.workstreams[*state.selected]
	if !known || !state.isActiveWorkstream(workstream) {
		return nil
	}
	return copyOptionalString(state.selected)
}

// boundWorkstreamWindow keeps the most recent workstreams and, when one is
// pinned, guarantees it is inside the result.
func boundWorkstreamWindow(
	ordered []*registryWorkstream,
	limit int,
	pinned *string,
) []*registryWorkstream {
	if len(ordered) <= limit {
		return ordered
	}
	window := ordered[:limit]
	if pinned == nil || containsWorkstream(window, *pinned) {
		return window
	}
	for _, workstream := range ordered[limit:] {
		if workstream.record.ID != *pinned {
			continue
		}
		windowed := make([]*registryWorkstream, 0, limit)
		windowed = append(windowed, workstream)
		return append(windowed, window[:limit-1]...)
	}
	return window
}
