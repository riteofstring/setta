package director

import (
	"fmt"

	"setta/internal/conversation"
)

// The source-fact-to-node mapping. Every visible node in the command center is
// projected from a durable Setta fact through exactly one rule here, so a graph
// can never be produced by parsing text, matching keywords, or guessing at
// provider payloads.
//
// Provider notifications are not source facts. `internal/agent` bounds what the
// Codex adapter may do with each notification, and only notifications that
// matrix marks normalized can become the typed Setta events this table maps.

// SourceFactDisposition is what one durable fact does to the semantic graph.
type SourceFactDisposition string

const (
	// SourceFactCreatesNode introduces a node the graph did not have.
	SourceFactCreatesNode SourceFactDisposition = "creates_node"
	// SourceFactUpdatesNode advances a node the projector already created,
	// which is how queue and run progress stay one node instead of a chain of
	// near-duplicates.
	SourceFactUpdatesNode SourceFactDisposition = "updates_node"
	// SourceFactUpsertsNode creates the node when this fact is the first
	// complete durable description of it, or advances the same identity when
	// earlier lifecycle facts already projected it.
	SourceFactUpsertsNode SourceFactDisposition = "upserts_node"
	// SourceFactConditionalNode creates a node only when typed state says the
	// fact is a visible semantic transition, and otherwise updates metadata.
	// Ready provider states, untyped activities, and a user's interruption
	// request take the metadata path.
	SourceFactConditionalNode SourceFactDisposition = "conditional_node"
	// SourceFactUpdatesMetadata changes workstream, run, or provider metadata
	// without producing a visible node.
	SourceFactUpdatesMetadata SourceFactDisposition = "updates_metadata"
	// SourceFactDetailSurface updates accessible text, public summaries, and
	// detail panels only. Streaming text never becomes graph truth.
	SourceFactDetailSurface SourceFactDisposition = "detail_surface"
)

// SourceFactResolution states how a rule decides its node kind.
type SourceFactResolution string

const (
	// SourceFactResolutionFixed always projects the rule's node kind.
	SourceFactResolutionFixed SourceFactResolution = "fixed"
	// SourceFactResolutionActivityKind selects the node kind from the typed
	// activity kind.
	SourceFactResolutionActivityKind SourceFactResolution = "activity_kind"
	// SourceFactResolutionAgentLiveness selects the node kind from the typed
	// agent liveness status.
	SourceFactResolutionAgentLiveness SourceFactResolution = "agent_liveness"
	// SourceFactResolutionProviderLifecycle selects the node kind from the
	// typed provider lifecycle status.
	SourceFactResolutionProviderLifecycle SourceFactResolution = "provider_lifecycle"
	// SourceFactResolutionValidationStatus selects the node kind from the typed
	// validation status, so a check with no verdict yet stays invisible.
	SourceFactResolutionValidationStatus SourceFactResolution = "validation_status"
	// SourceFactResolutionNone projects no node.
	SourceFactResolutionNone SourceFactResolution = "none"
)

// SemanticNodeIdentity names what a projected node id is derived from. It is
// the reason replay is deterministic: the same durable fact always addresses
// the same node.
type SemanticNodeIdentity string

const (
	SemanticNodeIdentityNone            SemanticNodeIdentity = ""
	SemanticNodeIdentityWorkstream      SemanticNodeIdentity = "workstream"
	SemanticNodeIdentityInput           SemanticNodeIdentity = "input"
	SemanticNodeIdentityDecision        SemanticNodeIdentity = "decision"
	SemanticNodeIdentityRun             SemanticNodeIdentity = "run"
	SemanticNodeIdentityRunTerminal     SemanticNodeIdentity = "run_terminal"
	SemanticNodeIdentityPlan            SemanticNodeIdentity = "plan"
	SemanticNodeIdentityPlanStep        SemanticNodeIdentity = "plan_step"
	SemanticNodeIdentityActivity        SemanticNodeIdentity = "activity"
	SemanticNodeIdentityFileChange      SemanticNodeIdentity = "file_change"
	SemanticNodeIdentityApproval        SemanticNodeIdentity = "approval"
	SemanticNodeIdentityResourceRequest SemanticNodeIdentity = "resource_request"
	SemanticNodeIdentitySubagent        SemanticNodeIdentity = "subagent"
	SemanticNodeIdentityArtifact        SemanticNodeIdentity = "artifact"
	SemanticNodeIdentityLifecycle       SemanticNodeIdentity = "lifecycle"
	SemanticNodeIdentityValidation      SemanticNodeIdentity = "validation"
	SemanticNodeIdentityRecovery        SemanticNodeIdentity = "recovery"
	SemanticNodeIdentityDirectorTurn    SemanticNodeIdentity = "director_turn"
	SemanticNodeIdentityToolCall        SemanticNodeIdentity = "tool_call"
	SemanticNodeIdentityDirectorReply   SemanticNodeIdentity = "director_reply"
)

var semanticNodeIdentities = []SemanticNodeIdentity{
	SemanticNodeIdentityWorkstream,
	SemanticNodeIdentityInput,
	SemanticNodeIdentityDecision,
	SemanticNodeIdentityRun,
	SemanticNodeIdentityRunTerminal,
	SemanticNodeIdentityPlan,
	SemanticNodeIdentityPlanStep,
	SemanticNodeIdentityActivity,
	SemanticNodeIdentityFileChange,
	SemanticNodeIdentityApproval,
	SemanticNodeIdentityResourceRequest,
	SemanticNodeIdentitySubagent,
	SemanticNodeIdentityArtifact,
	SemanticNodeIdentityLifecycle,
	SemanticNodeIdentityValidation,
	SemanticNodeIdentityRecovery,
	SemanticNodeIdentityDirectorTurn,
	SemanticNodeIdentityToolCall,
	SemanticNodeIdentityDirectorReply,
}

// SourceFactRule is one row of the mapping.
type SourceFactRule struct {
	Disposition  SourceFactDisposition
	Resolution   SourceFactResolution
	NodeKind     SemanticNodeKind
	NodeIdentity SemanticNodeIdentity
	// EdgeKinds are the typed relationships this fact may create. A rule may
	// create fewer edges than it lists; it may never create one it omits.
	EdgeKinds     []SemanticEdgeKind
	EvidenceClass EvidenceClass
	Note          string
}

// workstreamRecordFactRule maps the durable conversation record that owns a
// workstream's existence and current title. It is the only source of a
// workstream anchor: the conversation record is what proves the work exists, so
// nothing else may mint one.
var workstreamRecordFactRule = SourceFactRule{
	Disposition:   SourceFactUpsertsNode,
	Resolution:    SourceFactResolutionFixed,
	NodeKind:      SemanticNodeWorkstream,
	NodeIdentity:  SemanticNodeIdentityWorkstream,
	EdgeKinds:     nil,
	EvidenceClass: EvidenceRuntimeFact,
	Note:          "A durable conversation record creates the workstream anchor, and later record updates advance its title and provenance.",
}

// DirectorSourceFact is a durable Director-owned fact that has no conversation
// trajectory event, because the app-scoped registry owns it.
type DirectorSourceFact string

const (
	DirectorFactWorkstreamSelected      DirectorSourceFact = "workstream_selected"
	DirectorFactWorkstreamResourceBound DirectorSourceFact = "workstream_resource_bound"
	DirectorFactDecisionCommitted       DirectorSourceFact = "director_decision_committed"
	DirectorFactResourceRequestOpened   DirectorSourceFact = "resource_request_opened"
	DirectorFactResourceRequestResolved DirectorSourceFact = "resource_request_resolved"
	DirectorFactRecoveryAttempted       DirectorSourceFact = "recovery_attempted"
)

var directorSourceFacts = []DirectorSourceFact{
	DirectorFactWorkstreamSelected,
	DirectorFactWorkstreamResourceBound,
	DirectorFactDecisionCommitted,
	DirectorFactResourceRequestOpened,
	DirectorFactResourceRequestResolved,
	DirectorFactRecoveryAttempted,
}

var trajectoryFactRules = map[conversation.TrajectoryEventKind]SourceFactRule{
	conversation.TrajectoryEventUserInputAccepted: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeUserGoal,
		NodeIdentity:  SemanticNodeIdentityInput,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Accepted text or voice input owns the user-authored summary and starts the visible causal chain.",
	},
	conversation.TrajectoryEventTurnQueued: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityRun,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeDependsOn},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Queueing creates the one durable run node; it depends on the run it is queued behind.",
	},
	conversation.TrajectoryEventTurnPromoted: {
		Disposition:   SourceFactUpdatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityRun,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Promotion advances the existing run node instead of creating a duplicate.",
	},
	conversation.TrajectoryEventTurnStarted: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityRun,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A run that was never queued is created here; otherwise the queued run node becomes active.",
	},
	conversation.TrajectoryEventTurnSteered: {
		Disposition:   SourceFactUpdatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityRun,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Steering keeps one run node and records the new instruction as a milestone on it.",
	},
	conversation.TrajectoryEventTurnInterrupted: {
		Disposition:   SourceFactConditionalNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeCancelled,
		NodeIdentity:  SemanticNodeIdentityRunTerminal,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A user interruption request remains metadata while the run is active; the provider or system terminal fact closes the visible causal chain.",
	},
	conversation.TrajectoryEventTurnCompleted: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeCompleted,
		NodeIdentity:  SemanticNodeIdentityRunTerminal,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Completion closes the run chain and carries the artifact ids that earlier artifact facts produced.",
	},
	conversation.TrajectoryEventTurnFailed: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeFailed,
		NodeIdentity:  SemanticNodeIdentityRunTerminal,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Failure closes the run chain and is the anchor a later retry or recovery attaches to.",
	},
	conversation.TrajectoryEventAgentPublicTextDelta: {
		Disposition:   SourceFactDetailSurface,
		Resolution:    SourceFactResolutionNone,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Streaming public text updates the transcript surface; it never creates or renames a node.",
	},
	conversation.TrajectoryEventAgentMessageCompleted: {
		Disposition:   SourceFactDetailSurface,
		Resolution:    SourceFactResolutionNone,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Completed public output updates the final-answer surface and the run node's public summary.",
	},
	conversation.TrajectoryEventPublicReasoningSummaryUpdated: {
		Disposition:   SourceFactDetailSurface,
		Resolution:    SourceFactResolutionNone,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Public reasoning summaries update accessible text only. Private reasoning is never received.",
	},
	conversation.TrajectoryEventPlanChanged: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodePlan,
		NodeIdentity:  SemanticNodeIdentityPlan,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeDependsOn},
		EvidenceClass: EvidenceStructuredDeclaration,
		Note:          "A committed plan creates one plan node plus a milestone per step; step ids come from PlanStepNodeID.",
	},
	conversation.TrajectoryEventActivityStarted: {
		Disposition:   SourceFactConditionalNode,
		Resolution:    SourceFactResolutionActivityKind,
		NodeIdentity:  SemanticNodeIdentityActivity,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Typed activity kinds become action, investigation, or delegation nodes; durable artifacts have their own event.",
	},
	conversation.TrajectoryEventActivityProgressed: {
		Disposition:   SourceFactUpdatesNode,
		Resolution:    SourceFactResolutionActivityKind,
		NodeIdentity:  SemanticNodeIdentityActivity,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Progress advances the activity node the start created; process output stays a detail surface.",
	},
	conversation.TrajectoryEventActivityCompleted: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionActivityKind,
		NodeIdentity:  SemanticNodeIdentityActivity,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Completion succeeds the activity node; a later artifact_emitted fact owns any durable output.",
	},
	conversation.TrajectoryEventActivityFailed: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionActivityKind,
		NodeIdentity:  SemanticNodeIdentityActivity,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Failure fails the activity node and anchors a later retry.",
	},
	conversation.TrajectoryEventFileChangeProposed: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityFileChange,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A proposed change is an action with file-change evidence; approval state comes from approval events.",
	},
	conversation.TrajectoryEventFileChangeCompleted: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityFileChange,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "The typed outcome resolves the same file-change node the proposal created.",
	},
	conversation.TrajectoryEventApprovalRequested: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeApprovalRequired,
		NodeIdentity:  SemanticNodeIdentityApproval,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeBlockedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Secret questions and secret answers stay redacted in public graph state.",
	},
	conversation.TrajectoryEventApprovalResolved: {
		Disposition:   SourceFactUpdatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeApprovalRequired,
		NodeIdentity:  SemanticNodeIdentityApproval,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "The typed decision resolves the waiting approval node and unblocks what it blocked.",
	},
	conversation.TrajectoryEventSubagentStarted: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeDelegation,
		NodeIdentity:  SemanticNodeIdentitySubagent,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeDelegatedTo},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A subagent without a durable Setta conversation stays a delegation node inside its parent workstream.",
	},
	conversation.TrajectoryEventSubagentUpdated: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeDelegation,
		NodeIdentity:  SemanticNodeIdentitySubagent,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeDelegatedTo},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Subagent progress advances the delegation node.",
	},
	conversation.TrajectoryEventSubagentCompleted: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeDelegation,
		NodeIdentity:  SemanticNodeIdentitySubagent,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeDelegatedTo},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "The typed subagent status closes the delegation node.",
	},
	conversation.TrajectoryEventArtifactEmitted: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeArtifact,
		NodeIdentity:  SemanticNodeIdentityArtifact,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeProduced},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "The artifact node connects from the run or action that produced it.",
	},
	conversation.TrajectoryEventAgentLivenessChanged: {
		Disposition:   SourceFactConditionalNode,
		Resolution:    SourceFactResolutionAgentLiveness,
		NodeIdentity:  SemanticNodeIdentityLifecycle,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeBlockedBy, SemanticEdgeRecoveredBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Attached and terminal liveness update metadata; lost and reconciling become visible nodes.",
	},
	conversation.TrajectoryEventProviderLifecycleChanged: {
		Disposition:   SourceFactConditionalNode,
		Resolution:    SourceFactResolutionProviderLifecycle,
		NodeIdentity:  SemanticNodeIdentityLifecycle,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeBlockedBy, SemanticEdgeRecoveredBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Ready states update metadata; unavailable and closed states become blocked nodes, and restarting becomes recovery.",
	},
	conversation.TrajectoryEventValidationRecorded: {
		Disposition:   SourceFactConditionalNode,
		Resolution:    SourceFactResolutionValidationStatus,
		NodeIdentity:  SemanticNodeIdentityValidation,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeValidatedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A provider check with a verdict becomes a validation node over the work it covers; a check still running updates metadata.",
	},
	conversation.TrajectoryEventModelRerouted: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeRecovery,
		NodeIdentity:  SemanticNodeIdentityLifecycle,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeRecoveredBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "The typed reroute reason owns the meaning; risk is never inferred from surrounding text.",
	},
}

var directorFactRules = map[DirectorSourceFact]SourceFactRule{
	DirectorFactWorkstreamSelected: {
		Disposition:   SourceFactUpdatesMetadata,
		Resolution:    SourceFactResolutionNone,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Selection changes detail level and persisted app state; it never writes graph truth.",
	},
	DirectorFactWorkstreamResourceBound: {
		Disposition:   SourceFactUpdatesMetadata,
		Resolution:    SourceFactResolutionNone,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Binding a folder updates the workstream's resource scope; the resource request node resolves separately.",
	},
	DirectorFactDecisionCommitted: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeDirectorDecision,
		NodeIdentity:  SemanticNodeIdentityDecision,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceStructuredDeclaration,
		Note:          "Only a validated decision becomes a node; trusted code attaches ids, targets, and capabilities.",
	},
	DirectorFactResourceRequestOpened: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeResourceRequired,
		NodeIdentity:  SemanticNodeIdentityResourceRequest,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeBlockedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A durable resource request owns the node, so the affordance no longer depends on a routing failure code.",
	},
	DirectorFactResourceRequestResolved: {
		Disposition:   SourceFactUpdatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeResourceRequired,
		NodeIdentity:  SemanticNodeIdentityResourceRequest,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Resolution succeeds the waiting node and unblocks the work that depended on the resource.",
	},
	DirectorFactRecoveryAttempted: {
		Disposition:   SourceFactUpsertsNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeRetry,
		NodeIdentity:  SemanticNodeIdentityRecovery,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy, SemanticEdgeRecoveredBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "Acting on a failed, interrupted, lost, or unavailable path creates the retry the failure recovers through.",
	},
}

// directorConversationFactRules map the Director's own dialogue into the lane.
// The Director is a conversation with tools, so what it said and what it called
// are separate visible facts: prose is never evidence that the app changed, and
// a call is never evidence of what the user was told.
var directorConversationFactRules = map[conversation.DirectorConversationEntryKind]SourceFactRule{
	conversation.DirectorConversationUserTurn: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeUserGoal,
		NodeIdentity:  SemanticNodeIdentityDirectorTurn,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "What the user asked the app for owns the user-authored summary and opens the turn the lane resolves.",
	},
	conversation.DirectorConversationToolCall: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityToolCall,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "A Setta tool call is drawn when it is made and labelled by the tool, because its arguments are provider text.",
	},
	conversation.DirectorConversationToolReceipt: {
		Disposition:   SourceFactUpdatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeAction,
		NodeIdentity:  SemanticNodeIdentityToolCall,
		EvidenceClass: EvidenceRuntimeFact,
		Note:          "The receipt resolves the call it answers and replaces the label with Setta's own account of what happened.",
	},
	conversation.DirectorConversationAssistantText: {
		Disposition:   SourceFactCreatesNode,
		Resolution:    SourceFactResolutionFixed,
		NodeKind:      SemanticNodeMilestone,
		NodeIdentity:  SemanticNodeIdentityDirectorReply,
		EdgeKinds:     []SemanticEdgeKind{SemanticEdgeFollowedBy},
		EvidenceClass: EvidenceDirectorInterpretation,
		Note:          "The Director's reply is model-authored, so it carries the model that authored it and stays visually separable from an observed fact.",
	},
}

// TrajectoryFactRule returns the rule for one durable trajectory event kind.
func TrajectoryFactRule(kind conversation.TrajectoryEventKind) (SourceFactRule, error) {
	rule, known := trajectoryFactRules[kind]
	if !known {
		return SourceFactRule{}, fmt.Errorf("no source fact rule for trajectory event kind %q", kind)
	}
	return rule, nil
}

// DirectorFactRule returns the rule for one durable Director-owned fact.
func DirectorFactRule(fact DirectorSourceFact) (SourceFactRule, error) {
	rule, known := directorFactRules[fact]
	if !known {
		return SourceFactRule{}, fmt.Errorf("no source fact rule for director fact %q", fact)
	}
	return rule, nil
}

// DirectorConversationFactRule returns the rule for one durable Director
// conversation entry kind.
func DirectorConversationFactRule(
	kind conversation.DirectorConversationEntryKind,
) (SourceFactRule, error) {
	rule, known := directorConversationFactRules[kind]
	if !known {
		return SourceFactRule{}, fmt.Errorf("no source fact rule for director conversation entry kind %q", kind)
	}
	return rule, nil
}

// WorkstreamRecordFactRule returns the rule for the durable conversation
// record that owns a workstream anchor.
func WorkstreamRecordFactRule() SourceFactRule {
	return workstreamRecordFactRule
}

// DirectorSourceFacts returns the ordered Director-owned fact catalog.
func DirectorSourceFacts() []DirectorSourceFact {
	return append([]DirectorSourceFact(nil), directorSourceFacts...)
}
