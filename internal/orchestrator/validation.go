package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type RunnerRegistry struct {
	actionKinds map[WorkflowActionKind]struct{}
	runners     map[WorkflowActionKind]ActionRunner
	descriptors map[WorkflowActionKind]ActionRunnerDescriptor
}

type ActionRunnerDescriptor interface {
	Kind() WorkflowActionKind
	Capabilities(WorkflowActionConfig) (RunnerCapabilities, error)
	ValidateConfig(WorkflowActionConfig) []RunnerConfigDiagnostic
}

type ActionRunner interface {
	ActionRunnerDescriptor
	Start(context.Context, ActionStartRequest, RunnerEventSink) (ActionStartResult, error)
	Cancel(context.Context, ActionCancelRequest) error
	Signal(context.Context, ActionSignalRequest) (ActionSignalResult, error)
	Recover(context.Context, ActionRecoverRequest, RunnerEventSink) (ActionRecoverResult, error)
}

type RunnerEventSink interface {
	EmitRunnerEvent(RunnerEvent) error
}

type RunnerConfigDiagnostic struct {
	Code    string
	Message string
}

type ActionStartRequest struct {
	WorkspaceID         string
	DefinitionID        string
	DefinitionVersionID string
	Execution           WorkflowExecution
	Node                WorkflowNode
	NodeExecution       WorkflowNodeExecution
	Policy              WorkflowActionPolicy
	Capabilities        RunnerCapabilities
	InputHash           string
	Input               json.RawMessage
}

type ActionStartResult struct {
	RunnerRefs []WorkflowActionRunnerRef
}

type ActionCancelRequest struct {
	WorkspaceID   string
	ExecutionID   string
	NodeExecution WorkflowNodeExecution
	RunnerRefs    []WorkflowActionRunnerRef
}

type ActionSignalRequest struct {
	WorkspaceID   string
	ExecutionID   string
	NodeExecution WorkflowNodeExecution
	RunnerRefs    []WorkflowActionRunnerRef
	SignalName    string
	Payload       json.RawMessage
}

type ActionSignalResult struct {
	Accepted bool
	Message  string
}

type ActionRecoverRequest struct {
	WorkspaceID      string
	ExecutionID      string
	Execution        WorkflowExecution
	NodeExecution    WorkflowNodeExecution
	RunnerRefs       []WorkflowActionRunnerRef
	RunnerState      *WorkflowRunnerState
	LastEventOrdinal int
}

type ActionRecoverResult struct {
	Outcome     RunnerRecoveryOutcome
	Result      *WorkflowActionResult
	RunnerRefs  []WorkflowActionRunnerRef
	RunnerState *WorkflowRunnerState
	Message     string
}

func DefaultRunnerRegistry() RunnerRegistry {
	return RunnerRegistry{
		actionKinds: map[WorkflowActionKind]struct{}{
			ActionKindAgentCodex: {},
		},
		runners: map[WorkflowActionKind]ActionRunner{},
		descriptors: map[WorkflowActionKind]ActionRunnerDescriptor{
			ActionKindAgentCodex: CodexActionRunnerDescriptor{},
		},
	}
}

func (registry RunnerRegistry) IsActionKindRegistered(kind WorkflowActionKind) bool {
	_, ok := registry.actionKinds[kind]
	return ok
}

func (registry RunnerRegistry) WithRunner(runner ActionRunner) RunnerRegistry {
	if registry.actionKinds == nil {
		registry.actionKinds = map[WorkflowActionKind]struct{}{}
	}
	if registry.runners == nil {
		registry.runners = map[WorkflowActionKind]ActionRunner{}
	}
	if registry.descriptors == nil {
		registry.descriptors = map[WorkflowActionKind]ActionRunnerDescriptor{}
	}
	kind := runner.Kind()
	registry.actionKinds[kind] = struct{}{}
	registry.runners[kind] = runner
	registry.descriptors[kind] = runner
	return registry
}

func (registry RunnerRegistry) Runner(kind WorkflowActionKind) (ActionRunner, bool) {
	runner, ok := registry.runners[kind]
	return runner, ok
}

func (registry RunnerRegistry) Descriptor(kind WorkflowActionKind) (ActionRunnerDescriptor, bool) {
	descriptor, ok := registry.descriptors[kind]
	return descriptor, ok
}

func runnerSupportsOperation(capabilities RunnerCapabilities, operation RunnerOperation) bool {
	for _, candidate := range capabilities.Operations {
		if candidate == operation {
			return true
		}
	}
	return false
}

func ValidateGraph(graph WorkflowGraph, registry RunnerRegistry) WorkflowValidationResult {
	validator := graphValidator{
		graph:       graph,
		registry:    registry,
		nodesByID:   map[string]WorkflowNode{},
		edgesByID:   map[string]WorkflowEdge{},
		incoming:    map[string][]WorkflowEdge{},
		outgoing:    map[string][]WorkflowEdge{},
		startNodeID: "",
	}
	validator.validate()
	diagnostics := validator.diagnostics
	if diagnostics == nil {
		diagnostics = []WorkflowValidationDiagnostic{}
	}
	return WorkflowValidationResult{
		Valid:       !validator.hasErrors(),
		Diagnostics: diagnostics,
	}
}

type graphValidator struct {
	graph       WorkflowGraph
	registry    RunnerRegistry
	nodesByID   map[string]WorkflowNode
	edgesByID   map[string]WorkflowEdge
	incoming    map[string][]WorkflowEdge
	outgoing    map[string][]WorkflowEdge
	reachable   map[string]bool
	startNodeID string
	diagnostics []WorkflowValidationDiagnostic
}

func (validator *graphValidator) validate() {
	validator.collectNodes()
	validator.collectEdges()
	validator.validateNodes()
	validator.validateEdges()
	validator.validateReachability()
	validator.validateCycles()
}

func (validator *graphValidator) collectNodes() {
	startCount := 0
	endCount := 0
	for _, node := range validator.graph.Nodes {
		if node.ID == "" {
			validator.addNodeDiagnostic("node_id_required", "workflow node id is required", node.ID)
			continue
		}
		if !isStorageID(node.ID) {
			validator.addNodeDiagnostic("node_id_invalid", fmt.Sprintf("workflow node id %q must contain only letters, numbers, underscores, or hyphens", node.ID), node.ID)
		}
		if _, exists := validator.nodesByID[node.ID]; exists {
			validator.addNodeDiagnostic("duplicate_node_id", fmt.Sprintf("workflow node id %s is duplicated", node.ID), node.ID)
			continue
		}
		validator.nodesByID[node.ID] = node
		switch node.Kind {
		case NodeKindStart:
			startCount++
			validator.startNodeID = node.ID
		case NodeKindEnd:
			endCount++
		}
	}
	if startCount != 1 {
		validator.addDiagnostic("start_node_count", fmt.Sprintf("workflow must contain exactly one start node, found %d", startCount), "", "")
	}
	if endCount == 0 {
		validator.addDiagnostic("end_node_required", "workflow must contain at least one end node", "", "")
	}
}

func (validator *graphValidator) collectEdges() {
	for _, edge := range validator.graph.Edges {
		if edge.ID == "" {
			validator.addEdgeDiagnostic("edge_id_required", "workflow edge id is required", edge.ID)
			continue
		}
		if !isStorageID(edge.ID) {
			validator.addEdgeDiagnostic("edge_id_invalid", fmt.Sprintf("workflow edge id %q must contain only letters, numbers, underscores, or hyphens", edge.ID), edge.ID)
		}
		if _, exists := validator.edgesByID[edge.ID]; exists {
			validator.addEdgeDiagnostic("duplicate_edge_id", fmt.Sprintf("workflow edge id %s is duplicated", edge.ID), edge.ID)
			continue
		}
		validator.edgesByID[edge.ID] = edge
		validator.incoming[edge.ToNodeID] = append(validator.incoming[edge.ToNodeID], edge)
		validator.outgoing[edge.FromNodeID] = append(validator.outgoing[edge.FromNodeID], edge)
	}
}

func (validator *graphValidator) validateNodes() {
	for _, node := range validator.graph.Nodes {
		switch node.Kind {
		case NodeKindStart:
			validator.validateNoSpecialConfig(node)
			if len(validator.outgoing[node.ID]) == 0 {
				validator.addNodeDiagnostic("start_node_output_required", "start node must have at least one outgoing edge", node.ID)
			}
		case NodeKindEnd:
			validator.validateNoSpecialConfig(node)
			if len(validator.outgoing[node.ID]) > 0 {
				validator.addNodeDiagnostic("end_node_output_forbidden", fmt.Sprintf("end node %s must not have outgoing edges", node.ID), node.ID)
			}
		case NodeKindAction:
			validator.validateActionNode(node)
		case NodeKindGatewayAND, NodeKindGatewayOR, NodeKindGatewayXOR:
			validator.validateGatewayNode(node)
		case NodeKindLoopGuard:
			validator.validateLoopGuardNode(node)
		default:
			validator.addNodeDiagnostic("node_kind_unsupported", fmt.Sprintf("workflow node %s has unsupported kind %q", node.ID, node.Kind), node.ID)
		}
	}
}

func (validator *graphValidator) validateNoSpecialConfig(node WorkflowNode) {
	if node.Action != nil || node.Gateway != nil || node.LoopGuard != nil {
		validator.addNodeDiagnostic("node_config_not_allowed", fmt.Sprintf("%s node %s must not declare action, gateway, or loop guard config", node.Kind, node.ID), node.ID)
	}
}

func (validator *graphValidator) validateActionNode(node WorkflowNode) {
	if node.Action == nil {
		validator.addNodeDiagnostic("action_config_required", fmt.Sprintf("action node %s must declare action config", node.ID), node.ID)
		return
	}
	if node.Gateway != nil || node.LoopGuard != nil {
		validator.addNodeDiagnostic("action_config_exclusive", fmt.Sprintf("action node %s must not declare gateway or loop guard config", node.ID), node.ID)
	}
	if node.Action.Kind == "" {
		validator.addNodeDiagnostic("action_kind_required", fmt.Sprintf("action node %s action kind is required", node.ID), node.ID)
		return
	}
	if !validator.registry.IsActionKindRegistered(node.Action.Kind) {
		validator.addNodeDiagnostic("action_runner_unregistered", fmt.Sprintf("action node %s requires unregistered runner %q", node.ID, node.Action.Kind), node.ID)
		return
	}
	descriptor, ok := validator.registry.Descriptor(node.Action.Kind)
	if !ok {
		validator.addNodeDiagnostic("action_runner_descriptor_missing", fmt.Sprintf("action node %s has no descriptor for action kind %q", node.ID, node.Action.Kind), node.ID)
		return
	}
	for _, diagnostic := range descriptor.ValidateConfig(*node.Action) {
		validator.addNodeDiagnostic(diagnostic.Code, diagnostic.Message, node.ID)
	}
	capabilities, err := descriptor.Capabilities(*node.Action)
	if err != nil {
		validator.addNodeDiagnostic("action_runner_capabilities_invalid", fmt.Sprintf("action node %s runner capabilities failed: %v", node.ID, err), node.ID)
		return
	}
	if !runnerSupportsOperation(capabilities, RunnerOperationStart) {
		validator.addNodeDiagnostic("action_runner_start_unsupported", fmt.Sprintf("action node %s runner %q does not support start", node.ID, node.Action.Kind), node.ID)
	}
}

func (validator *graphValidator) validateGatewayNode(node WorkflowNode) {
	if node.Gateway == nil {
		validator.addNodeDiagnostic("gateway_config_required", fmt.Sprintf("gateway node %s must declare gateway config", node.ID), node.ID)
		return
	}
	if node.Action != nil || node.LoopGuard != nil {
		validator.addNodeDiagnostic("gateway_config_exclusive", fmt.Sprintf("gateway node %s must not declare action or loop guard config", node.ID), node.ID)
	}
	validator.validateGatewayRequiredIncoming(node)
	validator.validateGatewayShape(node)
}

func (validator *graphValidator) validateGatewayRequiredIncoming(node WorkflowNode) {
	required := map[string]bool{}
	for _, edgeID := range node.Gateway.RequiredIncoming {
		if required[edgeID] {
			validator.addNodeDiagnostic("gateway_required_input_duplicate", fmt.Sprintf("gateway node %s requires incoming edge %s more than once", node.ID, edgeID), node.ID)
			continue
		}
		required[edgeID] = true
		edge, ok := validator.edgesByID[edgeID]
		if !ok {
			validator.addNodeDiagnostic("gateway_required_input_missing", fmt.Sprintf("gateway node %s requires unknown incoming edge %s", node.ID, edgeID), node.ID)
			continue
		}
		if edge.ToNodeID != node.ID {
			validator.addNodeDiagnostic("gateway_required_input_wrong_node", fmt.Sprintf("gateway node %s requires edge %s, but that edge targets %s", node.ID, edgeID, edge.ToNodeID), node.ID)
		}
	}
	if len(required) == 0 {
		return
	}
	if node.Kind != NodeKindGatewayAND {
		validator.addNodeDiagnostic("gateway_required_inputs_only_and", fmt.Sprintf("gateway node %s declares requiredIncoming, but only AND gateways support required incoming edges", node.ID), node.ID)
		return
	}
	for _, edge := range validator.incoming[node.ID] {
		if !required[edge.ID] {
			validator.addNodeDiagnostic("and_gateway_required_inputs_must_cover_all_inputs", fmt.Sprintf("AND gateway %s requiredIncoming must include incoming edge %s", node.ID, edge.ID), node.ID)
		}
	}
}

func (validator *graphValidator) validateGatewayShape(node WorkflowNode) {
	switch node.Kind {
	case NodeKindGatewayAND:
		validator.validateANDGatewayShape(node.ID)
	case NodeKindGatewayOR:
		validator.validateGatewayHasOutput("or_gateway_output_required", "OR", node.ID)
	case NodeKindGatewayXOR:
		validator.validateXORGatewayShape(node.ID)
	}
}

func (validator *graphValidator) validateANDGatewayShape(nodeID string) {
	if len(validator.incoming[nodeID]) == 0 {
		validator.addNodeDiagnostic("and_gateway_input_required", fmt.Sprintf("AND gateway %s must have at least one incoming edge", nodeID), nodeID)
	}
	validator.validateGatewayHasOutput("and_gateway_output_required", "AND", nodeID)
}

func (validator *graphValidator) validateXORGatewayShape(nodeID string) {
	validator.validateGatewayHasOutput("xor_gateway_output_required", "XOR", nodeID)
	unconditional := 0
	for _, edge := range validator.outgoing[nodeID] {
		if edge.Condition == nil || edge.Condition.Kind == ConditionAlways {
			unconditional++
		}
	}
	if unconditional > 1 {
		validator.addNodeDiagnostic("xor_gateway_ambiguous_default", fmt.Sprintf("XOR gateway %s has %d unconditional outgoing edges", nodeID, unconditional), nodeID)
	}
}

func (validator *graphValidator) validateGatewayHasOutput(code string, label string, nodeID string) {
	if len(validator.outgoing[nodeID]) == 0 {
		validator.addNodeDiagnostic(code, fmt.Sprintf("%s gateway %s must have at least one outgoing edge", label, nodeID), nodeID)
	}
}

func (validator *graphValidator) validateLoopGuardNode(node WorkflowNode) {
	if node.LoopGuard == nil {
		validator.addNodeDiagnostic("loop_guard_config_required", fmt.Sprintf("loop guard node %s must declare loop guard config", node.ID), node.ID)
		return
	}
	if node.Action != nil || node.Gateway != nil {
		validator.addNodeDiagnostic("loop_guard_config_exclusive", fmt.Sprintf("loop guard node %s must not declare action or gateway config", node.ID), node.ID)
	}
	validator.validateLoopGuardLimit(node)
	validator.validateLoopGuardConditions(node)
	validator.validateLoopGuardEdges(node)
}

func (validator *graphValidator) validateLoopGuardLimit(node WorkflowNode) {
	if node.LoopGuard.MaxIterations != nil && *node.LoopGuard.MaxIterations <= 0 {
		validator.addNodeDiagnostic("loop_guard_max_iterations_invalid", fmt.Sprintf("loop guard node %s maxIterations must be positive when set", node.ID), node.ID)
	}
	if node.LoopGuard.LimitPolicy == "" {
		validator.addNodeDiagnostic("loop_guard_limit_policy_required", fmt.Sprintf("loop guard node %s limitPolicy is required", node.ID), node.ID)
	} else if !validLoopLimitPolicy(node.LoopGuard.LimitPolicy) {
		validator.addNodeDiagnostic("loop_guard_limit_policy_unsupported", fmt.Sprintf("loop guard node %s has unsupported limitPolicy %q", node.ID, node.LoopGuard.LimitPolicy), node.ID)
	}
}

func (validator *graphValidator) validateLoopGuardConditions(node WorkflowNode) {
	if node.LoopGuard.ContinueCondition != nil {
		validator.validateCondition(*node.LoopGuard.ContinueCondition, "loop_guard_continue_condition", node.ID, "")
	}
	if node.LoopGuard.ExitCondition != nil {
		validator.validateCondition(*node.LoopGuard.ExitCondition, "loop_guard_exit_condition", node.ID, "")
	}
}

func (validator *graphValidator) validateLoopGuardEdges(node WorkflowNode) {
	continueEdges := 0
	exitEdges := 0
	for _, edge := range validator.outgoing[node.ID] {
		switch edge.Kind {
		case EdgeKindLoopContinue:
			continueEdges++
		case EdgeKindLoopExit:
			exitEdges++
		}
	}
	if continueEdges == 0 {
		validator.addNodeDiagnostic("loop_guard_continue_edge_required", fmt.Sprintf("loop guard node %s must have at least one loop_continue outgoing edge", node.ID), node.ID)
	}
	if exitEdges == 0 {
		validator.addNodeDiagnostic("loop_guard_exit_edge_required", fmt.Sprintf("loop guard node %s must have at least one loop_exit outgoing edge", node.ID), node.ID)
	}
}

func (validator *graphValidator) validateEdges() {
	for _, edge := range validator.graph.Edges {
		validator.validateEdgeEndpoints(edge)
		validator.validateEdgeKind(edge)
		validator.validateEdgeCondition(edge)
	}
}

func (validator *graphValidator) validateEdgeEndpoints(edge WorkflowEdge) {
	if edge.FromNodeID == "" {
		validator.addEdgeDiagnostic("edge_from_required", fmt.Sprintf("edge %s fromNodeId is required", edge.ID), edge.ID)
	} else if _, ok := validator.nodesByID[edge.FromNodeID]; !ok {
		validator.addEdgeDiagnostic("edge_from_unknown", fmt.Sprintf("edge %s references unknown fromNodeId %s", edge.ID, edge.FromNodeID), edge.ID)
	}
	if edge.ToNodeID == "" {
		validator.addEdgeDiagnostic("edge_to_required", fmt.Sprintf("edge %s toNodeId is required", edge.ID), edge.ID)
	} else if _, ok := validator.nodesByID[edge.ToNodeID]; !ok {
		validator.addEdgeDiagnostic("edge_to_unknown", fmt.Sprintf("edge %s references unknown toNodeId %s", edge.ID, edge.ToNodeID), edge.ID)
	}
}

func (validator *graphValidator) validateEdgeKind(edge WorkflowEdge) {
	if edge.Kind == "" {
		validator.addEdgeDiagnostic("edge_kind_required", fmt.Sprintf("edge %s kind is required", edge.ID), edge.ID)
		return
	}
	if !validEdgeKind(edge.Kind) {
		validator.addEdgeDiagnostic("edge_kind_unsupported", fmt.Sprintf("edge %s has unsupported kind %q", edge.ID, edge.Kind), edge.ID)
		return
	}
	if edge.Kind == EdgeKindLoopContinue || edge.Kind == EdgeKindLoopExit {
		validator.validateLoopEdgeKind(edge)
	}
}

func (validator *graphValidator) validateLoopEdgeKind(edge WorkflowEdge) {
	fromNode, ok := validator.nodesByID[edge.FromNodeID]
	if ok && fromNode.Kind != NodeKindLoopGuard {
		validator.addEdgeDiagnostic("loop_edge_from_loop_guard_required", fmt.Sprintf("edge %s of kind %s must leave a loop guard node", edge.ID, edge.Kind), edge.ID)
	}
}

func (validator *graphValidator) validateEdgeCondition(edge WorkflowEdge) {
	if edge.Condition != nil {
		validator.validateCondition(*edge.Condition, "edge_condition_invalid", "", edge.ID)
	}
}

func (validator *graphValidator) validateCondition(condition WorkflowCondition, code string, nodeID string, edgeID string) {
	switch condition.Kind {
	case ConditionAlways:
	case ConditionActionStatus:
		validator.validateActionStatusCondition(condition, code, nodeID, edgeID)
	case ConditionActionSignal:
		validator.validateActionSignalCondition(condition, code, nodeID, edgeID)
	case ConditionScriptExitCode:
		validator.validateScriptExitCodeCondition(condition, code, nodeID, edgeID)
	default:
		validator.addDiagnostic(code, fmt.Sprintf("condition has unsupported kind %q", condition.Kind), nodeID, edgeID)
	}
}

func (validator *graphValidator) validateActionStatusCondition(condition WorkflowCondition, code string, nodeID string, edgeID string) {
	validator.validateConditionActionNode(condition, code, nodeID, edgeID, "action_status")
	if condition.Status == nil {
		validator.addDiagnostic(code, "action_status condition status is required", nodeID, edgeID)
	} else if !validNodeExecutionStatus(*condition.Status) {
		validator.addDiagnostic(code, fmt.Sprintf("action_status condition has unsupported status %q", *condition.Status), nodeID, edgeID)
	}
}

func (validator *graphValidator) validateActionSignalCondition(condition WorkflowCondition, code string, nodeID string, edgeID string) {
	validator.validateConditionActionNode(condition, code, nodeID, edgeID, "action_signal")
	if condition.SignalName == "" {
		validator.addDiagnostic(code, "action_signal condition signalName is required", nodeID, edgeID)
	}
}

func (validator *graphValidator) validateScriptExitCodeCondition(condition WorkflowCondition, code string, nodeID string, edgeID string) {
	validator.validateConditionActionNode(condition, code, nodeID, edgeID, "script_exit_code")
	if condition.ExitCode == nil {
		validator.addDiagnostic(code, "script_exit_code condition exitCode is required", nodeID, edgeID)
	}
}

func (validator *graphValidator) validateConditionActionNode(condition WorkflowCondition, code string, nodeID string, edgeID string, label string) {
	if condition.NodeID == "" {
		validator.addDiagnostic(code, label+" condition nodeId is required", nodeID, edgeID)
		return
	}
	node, ok := validator.nodesByID[condition.NodeID]
	if !ok {
		validator.addDiagnostic(code, fmt.Sprintf("%s condition references unknown node %s", label, condition.NodeID), nodeID, edgeID)
		return
	}
	if node.Kind != NodeKindAction {
		validator.addDiagnostic(code, fmt.Sprintf("%s condition references non-action node %s", label, condition.NodeID), nodeID, edgeID)
	}
}

func (validator *graphValidator) validateReachability() {
	if validator.startNodeID == "" {
		return
	}
	visited := map[string]bool{}
	var visit func(string)
	visit = func(nodeID string) {
		if visited[nodeID] {
			return
		}
		visited[nodeID] = true
		for _, edge := range validator.outgoing[nodeID] {
			if _, ok := validator.nodesByID[edge.ToNodeID]; ok {
				visit(edge.ToNodeID)
			}
		}
	}
	visit(validator.startNodeID)
	validator.reachable = visited
	for _, node := range validator.graph.Nodes {
		if node.ID != "" && !visited[node.ID] {
			validator.addNodeDiagnostic("unreachable_node", fmt.Sprintf("workflow node %s is unreachable from the start node", node.ID), node.ID)
		}
	}
}

func (validator *graphValidator) validateCycles() {
	for _, component := range validator.stronglyConnectedComponents() {
		if !validator.componentIsReachable(component) || !validator.componentIsCyclic(component) {
			continue
		}
		if validator.componentContainsAction(component) {
			continue
		}
		validator.validateControlOnlyComponentLiveness(component)
	}
}

func (validator *graphValidator) stronglyConnectedComponents() [][]string {
	search := strongComponentSearch{
		validator: validator,
		indexes:   map[string]int{},
		lowLinks:  map[string]int{},
		onStack:   map[string]bool{},
	}
	for _, node := range validator.graph.Nodes {
		if node.ID == "" {
			continue
		}
		if _, seen := search.indexes[node.ID]; !seen {
			search.visit(node.ID)
		}
	}
	return search.components
}

type strongComponentSearch struct {
	validator  *graphValidator
	nextIndex  int
	indexes    map[string]int
	lowLinks   map[string]int
	onStack    map[string]bool
	stack      []string
	components [][]string
}

func (search *strongComponentSearch) visit(nodeID string) {
	search.indexes[nodeID] = search.nextIndex
	search.lowLinks[nodeID] = search.nextIndex
	search.nextIndex++
	search.stack = append(search.stack, nodeID)
	search.onStack[nodeID] = true

	for _, edge := range search.validator.outgoing[nodeID] {
		search.visitEdge(nodeID, edge)
	}
	if search.lowLinks[nodeID] == search.indexes[nodeID] {
		search.popComponent(nodeID)
	}
}

func (search *strongComponentSearch) visitEdge(nodeID string, edge WorkflowEdge) {
	target := edge.ToNodeID
	if _, ok := search.validator.nodesByID[target]; !ok {
		return
	}
	if _, seen := search.indexes[target]; !seen {
		search.visit(target)
		if search.lowLinks[target] < search.lowLinks[nodeID] {
			search.lowLinks[nodeID] = search.lowLinks[target]
		}
		return
	}
	if search.onStack[target] && search.indexes[target] < search.lowLinks[nodeID] {
		search.lowLinks[nodeID] = search.indexes[target]
	}
}

func (search *strongComponentSearch) popComponent(nodeID string) {
	component := []string{}
	for {
		stackIndex := len(search.stack) - 1
		member := search.stack[stackIndex]
		search.stack = search.stack[:stackIndex]
		search.onStack[member] = false
		component = append(component, member)
		if member == nodeID {
			break
		}
	}
	search.components = append(search.components, component)
}

func (validator *graphValidator) componentIsReachable(component []string) bool {
	for _, nodeID := range component {
		if validator.reachable[nodeID] {
			return true
		}
	}
	return false
}

func (validator *graphValidator) componentIsCyclic(component []string) bool {
	if len(component) > 1 {
		return true
	}
	if len(component) == 0 {
		return false
	}
	nodeID := component[0]
	for _, edge := range validator.outgoing[nodeID] {
		if edge.ToNodeID == nodeID {
			return true
		}
	}
	return false
}

func (validator *graphValidator) componentContainsAction(component []string) bool {
	for _, nodeID := range component {
		if validator.nodesByID[nodeID].Kind == NodeKindAction {
			return true
		}
	}
	return false
}

func (validator *graphValidator) validateControlOnlyComponentLiveness(component []string) {
	componentSet := map[string]bool{}
	for _, nodeID := range component {
		componentSet[nodeID] = true
	}
	residualOutgoing := map[string][]WorkflowEdge{}
	for _, nodeID := range component {
		node := validator.nodesByID[nodeID]
		for _, edge := range validator.outgoing[nodeID] {
			if !componentSet[edge.ToNodeID] {
				continue
			}
			if boundedLoopContinueEdge(node, edge) {
				continue
			}
			residualOutgoing[nodeID] = append(residualOutgoing[nodeID], edge)
		}
	}
	edgeID, ok := residualCycleEdge(component, residualOutgoing)
	if !ok {
		return
	}
	validator.addEdgeDiagnostic(
		"control_cycle_requires_async_boundary_or_bound",
		fmt.Sprintf("control-only cycle %s must include an action node or be statically bounded by a finite loop guard continue edge", nodePathKey(component)),
		edgeID,
	)
}

func boundedLoopContinueEdge(node WorkflowNode, edge WorkflowEdge) bool {
	return node.Kind == NodeKindLoopGuard &&
		node.LoopGuard != nil &&
		node.LoopGuard.MaxIterations != nil &&
		*node.LoopGuard.MaxIterations > 0 &&
		edge.Kind == EdgeKindLoopContinue
}

func residualCycleEdge(component []string, outgoing map[string][]WorkflowEdge) (string, bool) {
	state := map[string]int{}
	var cycleEdgeID string
	var visit func(string) bool
	visit = func(nodeID string) bool {
		state[nodeID] = 1
		for _, edge := range outgoing[nodeID] {
			target := edge.ToNodeID
			switch state[target] {
			case 0:
				if visit(target) {
					return true
				}
			case 1:
				cycleEdgeID = edge.ID
				return true
			}
		}
		state[nodeID] = 2
		return false
	}
	for _, nodeID := range component {
		if state[nodeID] == 0 && visit(nodeID) {
			return cycleEdgeID, true
		}
	}
	return "", false
}

func nodePathKey(nodeIDs []string) string {
	return strings.Join(nodeIDs, " -> ")
}

func (validator *graphValidator) hasErrors() bool {
	for _, diagnostic := range validator.diagnostics {
		if diagnostic.Severity == ValidationSeverityError {
			return true
		}
	}
	return false
}

func (validator *graphValidator) addNodeDiagnostic(code string, message string, nodeID string) {
	validator.addDiagnostic(code, message, nodeID, "")
}

func (validator *graphValidator) addEdgeDiagnostic(code string, message string, edgeID string) {
	validator.addDiagnostic(code, message, "", edgeID)
}

func (validator *graphValidator) addDiagnostic(code string, message string, nodeID string, edgeID string) {
	validator.diagnostics = append(validator.diagnostics, WorkflowValidationDiagnostic{
		Severity: ValidationSeverityError,
		Code:     code,
		Message:  message,
		NodeID:   nodeID,
		EdgeID:   edgeID,
	})
}

func validEdgeKind(kind WorkflowEdgeKind) bool {
	for _, value := range workflowEdgeKindValues {
		if kind == value {
			return true
		}
	}
	return false
}

func validLoopLimitPolicy(policy WorkflowLoopLimitPolicy) bool {
	for _, value := range workflowLoopLimitPolicyValues {
		if policy == value {
			return true
		}
	}
	return false
}

func validNodeExecutionStatus(status WorkflowNodeExecutionStatus) bool {
	for _, value := range workflowNodeExecutionStatusValues {
		if status == value {
			return true
		}
	}
	return false
}

func isStorageID(value string) bool {
	if value == "" {
		return false
	}
	for _, valueRune := range value {
		if valueRune >= 'a' && valueRune <= 'z' ||
			valueRune >= 'A' && valueRune <= 'Z' ||
			valueRune >= '0' && valueRune <= '9' ||
			valueRune == '_' ||
			valueRune == '-' {
			continue
		}
		return false
	}
	return true
}
