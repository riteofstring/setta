package director

import (
	"fmt"
	"strconv"

	"setta/internal/conversation"
)

// SemanticNodeNone is the resolver result for a typed fact that updates
// metadata or a detail surface instead of producing a visible node. It is not a
// node kind: validation rejects it on a stored node.
const SemanticNodeNone SemanticNodeKind = ""

// NodeKindForActivity maps a typed activity onto its semantic kind. `other` has
// no precise meaning yet, so it stays invisible until a typed owner claims it
// rather than becoming a vague node the user cannot act on.
func NodeKindForActivity(kind conversation.TrajectoryActivityKind) (SemanticNodeKind, error) {
	switch kind {
	case conversation.TrajectoryActivityCommand,
		conversation.TrajectoryActivityMCPTool,
		conversation.TrajectoryActivityDynamicTool,
		conversation.TrajectoryActivityHook,
		conversation.TrajectoryActivityFileChange,
		// Sleep is executed, typed, and bounded work. Hiding it would make an
		// idle-looking graph while the worker is deliberately waiting.
		conversation.TrajectoryActivitySleep:
		return SemanticNodeAction, nil
	case conversation.TrajectoryActivityWebSearch,
		conversation.TrajectoryActivityImageView:
		return SemanticNodeInvestigation, nil
	case conversation.TrajectoryActivityImageGeneration:
		// Generating media is the action that produces an artifact, not the
		// artifact itself. The artifact node appears when the artifact is
		// durably emitted, because a node that claims to be an artifact without
		// naming one has no provenance to open.
		return SemanticNodeAction, nil
	case conversation.TrajectoryActivitySubagent:
		return SemanticNodeDelegation, nil
	case conversation.TrajectoryActivityOther:
		return SemanticNodeNone, nil
	default:
		return SemanticNodeNone, fmt.Errorf("unknown trajectory activity kind %q", kind)
	}
}

// NodeKindForAgentLiveness maps typed agent liveness onto a visible node.
// Attached liveness is healthy metadata, and terminal liveness is already told
// by the run's own terminal event, so neither creates a node.
func NodeKindForAgentLiveness(status conversation.AgentLivenessStatus) (SemanticNodeKind, error) {
	switch status {
	case conversation.AgentLivenessAttached, conversation.AgentLivenessTerminal:
		return SemanticNodeNone, nil
	case conversation.AgentLivenessReconciling:
		return SemanticNodeRecovery, nil
	case conversation.AgentLivenessLost:
		return SemanticNodeBlocked, nil
	default:
		return SemanticNodeNone, fmt.Errorf("unknown agent liveness status %q", status)
	}
}

// NodeKindForProviderLifecycle maps typed provider lifecycle onto a visible
// node. Only states the user or Director must act on become nodes.
func NodeKindForProviderLifecycle(status conversation.ProviderLifecycleStatus) (SemanticNodeKind, error) {
	switch status {
	case conversation.ProviderLifecycleReady:
		return SemanticNodeNone, nil
	case conversation.ProviderLifecycleRestarting:
		return SemanticNodeRecovery, nil
	case conversation.ProviderLifecycleUnavailable,
		conversation.ProviderLifecycleClosed:
		return SemanticNodeBlocked, nil
	default:
		return SemanticNodeNone, fmt.Errorf("unknown provider lifecycle status %q", status)
	}
}

// NodeKindForValidation maps a typed provider check onto a visible node. A
// check that has started and has no verdict yet says nothing the user can act
// on, and the work it covers is already visible, so it stays metadata until it
// reaches an outcome.
func NodeKindForValidation(status conversation.TrajectoryValidationStatus) (SemanticNodeKind, error) {
	switch status {
	case conversation.TrajectoryValidationStatusInProgress:
		return SemanticNodeNone, nil
	case conversation.TrajectoryValidationStatusPassed,
		conversation.TrajectoryValidationStatusFailed,
		conversation.TrajectoryValidationStatusInconclusive:
		return SemanticNodeValidation, nil
	default:
		return SemanticNodeNone, fmt.Errorf("unknown trajectory validation status %q", status)
	}
}

// SemanticNodeStatusForValidation maps a typed validation outcome onto its node
// status. An inconclusive check ended without a verdict, which is not the same
// fact as one that rejected the work.
func SemanticNodeStatusForValidation(status conversation.TrajectoryValidationStatus) (SemanticNodeStatus, error) {
	switch status {
	case conversation.TrajectoryValidationStatusInProgress:
		return SemanticNodeStatusActive, nil
	case conversation.TrajectoryValidationStatusPassed:
		return SemanticNodeStatusSucceeded, nil
	case conversation.TrajectoryValidationStatusFailed:
		return SemanticNodeStatusFailed, nil
	case conversation.TrajectoryValidationStatusInconclusive:
		return SemanticNodeStatusCancelled, nil
	default:
		return "", fmt.Errorf("unknown trajectory validation status %q", status)
	}
}

// SemanticActorForTrajectoryActor renames the durable trajectory actors into
// the Director product roles.
func SemanticActorForTrajectoryActor(actor conversation.TrajectoryActor) (SemanticActor, error) {
	switch actor {
	case conversation.TrajectoryActorUser:
		return SemanticActorUser, nil
	case conversation.TrajectoryActorAgent:
		return SemanticActorWorker, nil
	case conversation.TrajectoryActorProvider:
		return SemanticActorProvider, nil
	case conversation.TrajectoryActorSystem:
		return SemanticActorSystem, nil
	case conversation.TrajectoryActorMaster:
		return SemanticActorDirector, nil
	default:
		return "", fmt.Errorf("unknown trajectory actor %q", actor)
	}
}

// SemanticNodeStatusForRun maps a durable run status onto its node status.
func SemanticNodeStatusForRun(status conversation.TurnStatus) (SemanticNodeStatus, error) {
	switch status {
	case conversation.TurnStatusQueued:
		return SemanticNodeStatusPending, nil
	case conversation.TurnStatusRunning:
		return SemanticNodeStatusActive, nil
	case conversation.TurnStatusCompleted:
		return SemanticNodeStatusSucceeded, nil
	case conversation.TurnStatusCancelled:
		return SemanticNodeStatusCancelled, nil
	case conversation.TurnStatusFailed:
		return SemanticNodeStatusFailed, nil
	default:
		return "", fmt.Errorf("unknown run status %q", status)
	}
}

// SemanticNodeStatusForPlanStep maps a plan step status onto its node status.
func SemanticNodeStatusForPlanStep(status conversation.PlanStepStatus) (SemanticNodeStatus, error) {
	switch status {
	case conversation.PlanStepStatusPending:
		return SemanticNodeStatusPending, nil
	case conversation.PlanStepStatusInProgress:
		return SemanticNodeStatusActive, nil
	case conversation.PlanStepStatusCompleted:
		return SemanticNodeStatusSucceeded, nil
	default:
		return "", fmt.Errorf("unknown plan step status %q", status)
	}
}

// ApprovalStatusForDecision maps a durable approval decision onto the Director
// approval lifecycle.
func ApprovalStatusForDecision(decision conversation.TrajectoryApprovalDecision) (ApprovalStatus, error) {
	switch decision {
	case conversation.TrajectoryApprovalDecisionApproved:
		return ApprovalStatusApproved, nil
	case conversation.TrajectoryApprovalDecisionApprovedForSession:
		return ApprovalStatusApprovedForSession, nil
	case conversation.TrajectoryApprovalDecisionDenied:
		return ApprovalStatusDenied, nil
	case conversation.TrajectoryApprovalDecisionCancelled:
		return ApprovalStatusCancelled, nil
	case conversation.TrajectoryApprovalDecisionAnswered:
		return ApprovalStatusAnswered, nil
	case conversation.TrajectoryApprovalDecisionSuperseded:
		return ApprovalStatusSuperseded, nil
	default:
		return "", fmt.Errorf("unknown approval decision %q", decision)
	}
}

// SemanticNodeID derives the deterministic node id for one node identity and
// its Setta-owned durable source. Replaying the same events must address the
// same node, so ids are derived rather than generated. Provider-backed updates
// resolve through projector-local maps and never use provider ids here.
func SemanticNodeID(identity SemanticNodeIdentity, sourceID string) (string, error) {
	if !isSemanticNodeIdentity(identity) {
		return "", fmt.Errorf("unknown semantic node identity %q", identity)
	}
	if identity == SemanticNodeIdentityPlanStep {
		return "", fmt.Errorf("plan step node ids require a step index; use PlanStepNodeID")
	}
	if err := validateIdentifier("semantic node source id", sourceID); err != nil {
		return "", err
	}
	return string(identity) + ":" + sourceID, nil
}

// PlanStepNodeID derives the id of one plan step milestone. Provider plan steps
// carry no stable identity, so the committed plan event id plus the step index
// is the identity. If the durable contract ever gains step ids, this derivation
// is the single place that changes.
func PlanStepNodeID(sourceEventID string, stepIndex int) (string, error) {
	if err := validateIdentifier("plan step source event id", sourceEventID); err != nil {
		return "", err
	}
	if stepIndex < 0 {
		return "", fmt.Errorf("plan step index must not be negative: %d", stepIndex)
	}
	return string(SemanticNodeIdentityPlanStep) + ":" + sourceEventID + ":" + strconv.Itoa(stepIndex), nil
}

// ValidateSourceFactCoverage proves the mapping is total and internally
// consistent: every durable fact has exactly one rule, every rule's resolution
// matches its node kind, and every typed resolver covers its whole catalog.
// Adding a trajectory event kind, activity kind, or lifecycle status without a
// decision here fails loudly.
func ValidateSourceFactCoverage() error {
	if err := validateTrajectoryFactCoverage(); err != nil {
		return err
	}
	if err := validateDirectorFactCoverage(); err != nil {
		return err
	}
	if err := validateResolverCoverage(); err != nil {
		return err
	}
	return validateNodeKindCoverage()
}

// validateNodeKindCoverage proves the mapping runs in both directions: every
// node kind the catalog offers is actually produced by some durable fact. A kind
// nothing can produce is a promise the graph cannot keep, and it is exactly how
// a renderer ends up inventing a source for it.
func validateNodeKindCoverage() error {
	produced := make(map[SemanticNodeKind]bool, len(semanticNodeKinds))
	for _, rule := range trajectoryFactRules {
		markProducedNodeKind(produced, rule)
	}
	for _, rule := range directorFactRules {
		markProducedNodeKind(produced, rule)
	}
	if err := markResolvedNodeKinds(produced); err != nil {
		return err
	}
	for _, kind := range semanticNodeKinds {
		if !produced[kind] {
			return fmt.Errorf("semantic node kind %q has no durable fact that produces it", kind)
		}
	}
	return nil
}

func markProducedNodeKind(produced map[SemanticNodeKind]bool, rule SourceFactRule) {
	if rule.Resolution == SourceFactResolutionFixed {
		produced[rule.NodeKind] = true
	}
}

func markResolvedNodeKinds(produced map[SemanticNodeKind]bool) error {
	for _, kind := range conversation.TrajectoryActivityKinds() {
		resolved, err := NodeKindForActivity(kind)
		if err != nil {
			return err
		}
		markResolvedNodeKind(produced, resolved)
	}
	for _, status := range conversation.AgentLivenessStatuses() {
		resolved, err := NodeKindForAgentLiveness(status)
		if err != nil {
			return err
		}
		markResolvedNodeKind(produced, resolved)
	}
	for _, status := range conversation.ProviderLifecycleStatuses() {
		resolved, err := NodeKindForProviderLifecycle(status)
		if err != nil {
			return err
		}
		markResolvedNodeKind(produced, resolved)
	}
	for _, status := range conversation.TrajectoryValidationStatuses() {
		resolved, err := NodeKindForValidation(status)
		if err != nil {
			return err
		}
		markResolvedNodeKind(produced, resolved)
	}
	return nil
}

func markResolvedNodeKind(produced map[SemanticNodeKind]bool, kind SemanticNodeKind) {
	if kind != SemanticNodeNone {
		produced[kind] = true
	}
}

func validateTrajectoryFactCoverage() error {
	kinds := conversation.TrajectoryEventKinds()
	for _, kind := range kinds {
		rule, err := TrajectoryFactRule(kind)
		if err != nil {
			return err
		}
		if err := validateSourceFactRule(string(kind), rule); err != nil {
			return err
		}
	}
	if len(trajectoryFactRules) != len(kinds) {
		return fmt.Errorf(
			"source fact mapping has %d rules for %d trajectory event kinds",
			len(trajectoryFactRules),
			len(kinds),
		)
	}
	return nil
}

func validateDirectorFactCoverage() error {
	for _, fact := range directorSourceFacts {
		rule, err := DirectorFactRule(fact)
		if err != nil {
			return err
		}
		if err := validateSourceFactRule(string(fact), rule); err != nil {
			return err
		}
	}
	if len(directorFactRules) != len(directorSourceFacts) {
		return fmt.Errorf(
			"source fact mapping has %d rules for %d director facts",
			len(directorFactRules),
			len(directorSourceFacts),
		)
	}
	return nil
}

func validateResolverCoverage() error {
	for _, kind := range conversation.TrajectoryActivityKinds() {
		if _, err := NodeKindForActivity(kind); err != nil {
			return err
		}
	}
	for _, status := range conversation.AgentLivenessStatuses() {
		if _, err := NodeKindForAgentLiveness(status); err != nil {
			return err
		}
	}
	for _, status := range conversation.ProviderLifecycleStatuses() {
		if _, err := NodeKindForProviderLifecycle(status); err != nil {
			return err
		}
	}
	for _, status := range conversation.PlanStepStatuses() {
		if _, err := SemanticNodeStatusForPlanStep(status); err != nil {
			return err
		}
	}
	for _, status := range conversation.TrajectoryValidationStatuses() {
		if _, err := NodeKindForValidation(status); err != nil {
			return err
		}
		if _, err := SemanticNodeStatusForValidation(status); err != nil {
			return err
		}
	}
	return nil
}

func validateSourceFactRule(label string, rule SourceFactRule) error {
	producesNode := rule.Disposition == SourceFactCreatesNode ||
		rule.Disposition == SourceFactUpdatesNode ||
		rule.Disposition == SourceFactUpsertsNode ||
		rule.Disposition == SourceFactConditionalNode
	switch rule.Disposition {
	case SourceFactCreatesNode, SourceFactUpdatesNode, SourceFactUpsertsNode, SourceFactConditionalNode,
		SourceFactUpdatesMetadata, SourceFactDetailSurface:
	default:
		return fmt.Errorf("source fact %s has unknown disposition %q", label, rule.Disposition)
	}
	if err := validateSourceFactResolution(label, rule, producesNode); err != nil {
		return err
	}
	if producesNode != (rule.NodeIdentity != SemanticNodeIdentityNone) {
		return fmt.Errorf("source fact %s must name a node identity when, and only when, it projects a node", label)
	}
	if rule.NodeIdentity != SemanticNodeIdentityNone && !isSemanticNodeIdentity(rule.NodeIdentity) {
		return fmt.Errorf("source fact %s has unknown node identity %q", label, rule.NodeIdentity)
	}
	if !isEvidenceClass(rule.EvidenceClass) {
		return fmt.Errorf("source fact %s has unknown evidence class %q", label, rule.EvidenceClass)
	}
	for _, edgeKind := range rule.EdgeKinds {
		if !isSemanticEdgeKind(edgeKind) {
			return fmt.Errorf("source fact %s has unknown edge kind %q", label, edgeKind)
		}
	}
	return validateTrimmedText(fmt.Sprintf("source fact %s note", label), rule.Note)
}

func validateSourceFactResolution(label string, rule SourceFactRule, producesNode bool) error {
	switch rule.Resolution {
	case SourceFactResolutionFixed:
		if !producesNode {
			return fmt.Errorf("source fact %s resolves a fixed node kind without projecting a node", label)
		}
		if !isSemanticNodeKind(rule.NodeKind) {
			return fmt.Errorf("source fact %s has unknown node kind %q", label, rule.NodeKind)
		}
	case SourceFactResolutionActivityKind,
		SourceFactResolutionAgentLiveness,
		SourceFactResolutionProviderLifecycle,
		SourceFactResolutionValidationStatus:
		if !producesNode {
			return fmt.Errorf("source fact %s resolves a node kind without projecting a node", label)
		}
		if rule.NodeKind != SemanticNodeNone {
			return fmt.Errorf("source fact %s must not fix a node kind it resolves from typed state", label)
		}
	case SourceFactResolutionNone:
		if producesNode {
			return fmt.Errorf("source fact %s projects a node without a resolution", label)
		}
		if rule.NodeKind != SemanticNodeNone {
			return fmt.Errorf("source fact %s names a node kind but projects no node", label)
		}
	default:
		return fmt.Errorf("source fact %s has unknown resolution %q", label, rule.Resolution)
	}
	return nil
}

func isSemanticNodeIdentity(identity SemanticNodeIdentity) bool {
	for _, candidate := range semanticNodeIdentities {
		if candidate == identity {
			return true
		}
	}
	return false
}
