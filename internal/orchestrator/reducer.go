package orchestrator

import (
	"encoding/json"
	"errors"
	"fmt"
)

type IDGenerator func(prefix string) (string, error)

type TransitionContext struct {
	Now   string
	NewID IDGenerator
}

type WorkflowTransition struct {
	Execution WorkflowExecution
	Events    []WorkflowEvent
}

func StartExecution(version WorkflowDefinitionVersion, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	startNode, ok := startNode(version.Graph)
	if !ok {
		return WorkflowTransition{}, errors.New("workflow version has no start node")
	}
	executionID, err := context.NewID("workflow_execution")
	if err != nil {
		return WorkflowTransition{}, fmt.Errorf("create workflow execution id: %w", err)
	}
	execution := WorkflowExecution{
		SchemaVersion:          SchemaVersion,
		ID:                     executionID,
		WorkspaceID:            version.WorkspaceID,
		DefinitionID:           version.DefinitionID,
		DefinitionVersionID:    version.ID,
		Status:                 ExecutionStatusRunning,
		CreatedAt:              context.Now,
		StartedAt:              context.Now,
		UpdatedAt:              context.Now,
		NodeExecutions:         []WorkflowNodeExecution{},
		Tokens:                 []WorkflowToken{},
		LoopIterations:         []WorkflowLoopIteration{},
		ActiveNodeExecutionIDs: []string{},
	}
	events := []WorkflowEvent{}
	if err := appendEvent(&execution, &events, context, EventExecutionStarted, WorkflowEvent{
		Message: "workflow execution started",
	}); err != nil {
		return WorkflowTransition{}, err
	}
	if err := emitToken(&execution, context, startNode.ID, "", "", 1); err != nil {
		return WorkflowTransition{}, err
	}
	if err := advanceExecution(&execution, version.Graph, context, &events); err != nil {
		return WorkflowTransition{}, err
	}
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func CompleteAction(execution WorkflowExecution, graph WorkflowGraph, nodeExecutionID string, result WorkflowActionResult, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return WorkflowTransition{}, fmt.Errorf("workflow execution %s is %s, not running", execution.ID, execution.Status)
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowTransition{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	nodeExecution := &execution.NodeExecutions[index]
	if nodeExecution.Status != NodeExecutionStatusRunning && nodeExecution.Status != NodeExecutionStatusWaitingApproval {
		return WorkflowTransition{}, fmt.Errorf("node execution %s is %s, not running or waiting_approval", nodeExecutionID, nodeExecution.Status)
	}
	if result.Status == "" {
		result.Status = ActionCompletionCompleted
	}

	events := []WorkflowEvent{}
	if err := applyActionCompletion(&execution, graph, nodeExecution, result, context, &events); err != nil {
		return WorkflowTransition{}, err
	}
	if execution.Status == ExecutionStatusRunning {
		if err := advanceExecution(&execution, graph, context, &events); err != nil {
			if terminalErr := failExecution(&execution, &events, context, TerminalReasonRoutingFailed, err.Error()); terminalErr != nil {
				return WorkflowTransition{}, terminalErr
			}
		}
	}
	refreshActiveNodeExecutionIDs(&execution)
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func StartAction(execution WorkflowExecution, nodeExecutionID string, metadata WorkflowActionStartMetadata, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return WorkflowTransition{}, fmt.Errorf("workflow execution %s is %s, not running", execution.ID, execution.Status)
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowTransition{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	nodeExecution := &execution.NodeExecutions[index]
	if nodeExecution.Status != NodeExecutionStatusReady {
		return WorkflowTransition{}, fmt.Errorf("node execution %s is %s, not ready", nodeExecutionID, nodeExecution.Status)
	}
	nodeExecution.Status = NodeExecutionStatusRunning
	nodeExecution.StartedAt = context.Now
	applyActionStartMetadata(nodeExecution, metadata)
	events := []WorkflowEvent{}
	if err := appendEvent(&execution, &events, context, EventActionStarted, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("action node %s started", nodeExecution.NodeID),
	}); err != nil {
		return WorkflowTransition{}, err
	}
	refreshActiveNodeExecutionIDs(&execution)
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func applyActionCompletion(execution *WorkflowExecution, graph WorkflowGraph, nodeExecution *WorkflowNodeExecution, result WorkflowActionResult, context TransitionContext, events *[]WorkflowEvent) error {
	switch result.Status {
	case ActionCompletionCompleted:
		return applyActionCompleted(execution, graph, nodeExecution, result, context, events)
	case ActionCompletionFailed:
		return applyActionFailed(execution, nodeExecution, result, context, events)
	case ActionCompletionCancelled:
		return applyActionCancelled(execution, nodeExecution, result, context, events)
	case ActionCompletionRequiresApproval:
		return applyActionRequiresApproval(execution, nodeExecution, result, context, events)
	default:
		return fmt.Errorf("unsupported action completion status %q", result.Status)
	}
}

func applyActionCompleted(execution *WorkflowExecution, graph WorkflowGraph, nodeExecution *WorkflowNodeExecution, result WorkflowActionResult, context TransitionContext, events *[]WorkflowEvent) error {
	setNodeExecutionResult(nodeExecution, NodeExecutionStatusSucceeded, result, context.Now)
	if err := appendEvent(execution, events, context, EventActionCompleted, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("action node %s completed", nodeExecution.NodeID),
	}); err != nil {
		return err
	}
	if err := emitMatchingOutgoingTokens(execution, graph, context, nodeExecution.NodeID, nodeExecution.Iteration, allMatchingEdges); err != nil {
		return failExecution(execution, events, context, TerminalReasonRoutingFailed, err.Error())
	}
	return nil
}

func applyActionFailed(execution *WorkflowExecution, nodeExecution *WorkflowNodeExecution, result WorkflowActionResult, context TransitionContext, events *[]WorkflowEvent) error {
	setNodeExecutionResult(nodeExecution, NodeExecutionStatusFailed, result, context.Now)
	nodeExecution.Error = result.Error
	if err := appendEvent(execution, events, context, EventActionFailed, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         nonEmpty(result.Error, fmt.Sprintf("action node %s failed", nodeExecution.NodeID)),
	}); err != nil {
		return err
	}
	return failExecution(execution, events, context, TerminalReasonActionFailed, nodeExecution.Error)
}

func applyActionCancelled(execution *WorkflowExecution, nodeExecution *WorkflowNodeExecution, result WorkflowActionResult, context TransitionContext, events *[]WorkflowEvent) error {
	setNodeExecutionResult(nodeExecution, NodeExecutionStatusCancelled, result, context.Now)
	if err := appendEvent(execution, events, context, EventActionCancelled, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("action node %s cancelled", nodeExecution.NodeID),
	}); err != nil {
		return err
	}
	return cancelExecution(execution, events, context, TerminalReasonActionCancelled, "action cancelled")
}

func applyActionRequiresApproval(execution *WorkflowExecution, nodeExecution *WorkflowNodeExecution, result WorkflowActionResult, context TransitionContext, events *[]WorkflowEvent) error {
	setNodeExecutionResult(nodeExecution, NodeExecutionStatusWaitingApproval, result, "")
	details, err := pendingApprovalEventDetails(result.PendingApproval)
	if err != nil {
		return err
	}
	return appendEvent(execution, events, context, EventActionApprovalWait, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("action node %s is waiting for approval", nodeExecution.NodeID),
		Details:         details,
	})
}

func pendingApprovalEventDetails(pendingApproval *WorkflowPendingApproval) (json.RawMessage, error) {
	if pendingApproval == nil {
		return nil, nil
	}
	return json.Marshal(struct {
		PendingApproval *WorkflowPendingApproval `json:"pendingApproval"`
	}{PendingApproval: pendingApproval})
}

func setNodeExecutionResult(nodeExecution *WorkflowNodeExecution, status WorkflowNodeExecutionStatus, result WorkflowActionResult, completedAt string) {
	nodeExecution.Status = status
	if completedAt != "" {
		nodeExecution.CompletedAt = completedAt
	}
	normalized := normalizeActionResult(result)
	nodeExecution.Result = &normalized
}

func CancelExecution(execution WorkflowExecution, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	if execution.Status != ExecutionStatusRunning && execution.Status != ExecutionStatusIdle {
		return WorkflowTransition{}, fmt.Errorf("workflow execution %s is %s, not cancellable", execution.ID, execution.Status)
	}
	events := []WorkflowEvent{}
	if err := cancelExecution(&execution, &events, context, TerminalReasonExecutionCancelled, "workflow execution cancelled"); err != nil {
		return WorkflowTransition{}, err
	}
	refreshActiveNodeExecutionIDs(&execution)
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func InterruptExecution(execution WorkflowExecution, context TransitionContext, message string) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return WorkflowTransition{Execution: execution}, nil
	}
	closeActiveWork(&execution, context.Now, NodeExecutionStatusFailed, message)
	events := []WorkflowEvent{}
	if err := failExecution(&execution, &events, context, TerminalReasonInterrupted, message); err != nil {
		return WorkflowTransition{}, err
	}
	refreshActiveNodeExecutionIDs(&execution)
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func validateTransitionContext(context TransitionContext) error {
	if context.Now == "" {
		return errors.New("transition timestamp is required")
	}
	if context.NewID == nil {
		return errors.New("transition id generator is required")
	}
	return nil
}

func advanceExecution(execution *WorkflowExecution, graph WorkflowGraph, context TransitionContext, events *[]WorkflowEvent) error {
	processedSteps := 0
	stepBudget := synchronousStepBudget(graph)
	for execution.Status == ExecutionStatusRunning {
		progress := false
		for _, tokenIndex := range activeTokenIndexes(*execution) {
			if execution.Status != ExecutionStatusRunning {
				break
			}
			if tokenIndex >= len(execution.Tokens) || execution.Tokens[tokenIndex].Status != TokenStatusActive {
				continue
			}
			processed, err := processToken(execution, graph, tokenIndex, context, events)
			if err != nil {
				return err
			}
			if processed {
				processedSteps++
				if processedSteps > stepBudget {
					return synchronousStepBudgetExceededError(graph, stepBudget)
				}
				progress = true
			}
		}
		if !progress {
			break
		}
	}
	if err := settleExecution(execution, graph, context, events); err != nil {
		return err
	}
	refreshActiveNodeExecutionIDs(execution)
	return nil
}

// settleExecution owns reducer quiescence: after token advancement stalls, a
// running execution may only wait on active node executions.
func settleExecution(execution *WorkflowExecution, graph WorkflowGraph, context TransitionContext, events *[]WorkflowEvent) error {
	if execution.Status != ExecutionStatusRunning {
		return nil
	}
	if hasActiveNodeExecutions(*execution) {
		return nil
	}
	if hasActiveTokens(*execution) {
		return failExecution(execution, events, context, TerminalReasonRoutingFailed, "workflow execution has blocked tokens but no active actions can unblock them")
	}
	if executionReachedEndNode(*execution, graph) {
		return completeExecution(execution, events, context, TerminalReasonEndReached, "workflow execution completed")
	}
	return failExecution(execution, events, context, TerminalReasonRoutingFailed, "workflow execution has no active work before reaching an end node")
}

func processToken(execution *WorkflowExecution, graph WorkflowGraph, tokenIndex int, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	token := execution.Tokens[tokenIndex]
	node, ok := nodeByID(graph, token.NodeID)
	if !ok {
		return false, fmt.Errorf("token %s references unknown node %s", token.ID, token.NodeID)
	}
	switch node.Kind {
	case NodeKindStart:
		return processStartToken(execution, graph, tokenIndex, node, context, events)
	case NodeKindEnd:
		return processEndToken(execution, tokenIndex, node, context, events)
	case NodeKindAction:
		return processActionToken(execution, tokenIndex, node, context, events)
	case NodeKindGatewayAND:
		return processANDGatewayToken(execution, graph, tokenIndex, node, context, events)
	case NodeKindGatewayOR:
		return processORGatewayToken(execution, graph, tokenIndex, node, context, events)
	case NodeKindGatewayXOR:
		return processXORGatewayToken(execution, graph, tokenIndex, node, context, events)
	case NodeKindLoopGuard:
		return processLoopGuardToken(execution, graph, tokenIndex, node, context, events)
	default:
		return false, fmt.Errorf("node %s has unsupported kind %q", node.ID, node.Kind)
	}
}

func processStartToken(execution *WorkflowExecution, graph WorkflowGraph, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	if err := consumeToken(execution, tokenIndex, context.Now); err != nil {
		return false, err
	}
	nodeExecution, err := addControlNodeExecution(execution, context, node.ID, execution.Tokens[tokenIndex].Iteration)
	if err != nil {
		return false, err
	}
	if err := appendEvent(execution, events, context, EventNodeScheduled, WorkflowEvent{
		NodeID:          node.ID,
		NodeExecutionID: nodeExecution.ID,
		TokenID:         execution.Tokens[tokenIndex].ID,
		Message:         "start node released",
	}); err != nil {
		return false, err
	}
	if err := emitMatchingOutgoingTokens(execution, graph, context, node.ID, execution.Tokens[tokenIndex].Iteration, allMatchingEdges); err != nil {
		return false, err
	}
	return true, nil
}

func processEndToken(execution *WorkflowExecution, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	if err := consumeToken(execution, tokenIndex, context.Now); err != nil {
		return false, err
	}
	nodeExecution, err := addControlNodeExecution(execution, context, node.ID, execution.Tokens[tokenIndex].Iteration)
	if err != nil {
		return false, err
	}
	if err := appendEvent(execution, events, context, EventNodeScheduled, WorkflowEvent{
		NodeID:          node.ID,
		NodeExecutionID: nodeExecution.ID,
		TokenID:         execution.Tokens[tokenIndex].ID,
		Message:         "end node reached",
	}); err != nil {
		return false, err
	}
	return true, nil
}

func processActionToken(execution *WorkflowExecution, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	if node.Action == nil {
		return false, fmt.Errorf("action node %s has no action config", node.ID)
	}
	if err := consumeToken(execution, tokenIndex, context.Now); err != nil {
		return false, err
	}
	nodeExecutionID, err := context.NewID("workflow_node_execution")
	if err != nil {
		return false, fmt.Errorf("create node execution id: %w", err)
	}
	iteration := execution.Tokens[tokenIndex].Iteration
	attempt := nextNodeAttempt(*execution, node.ID)
	actionKind := node.Action.Kind
	nodeExecution := WorkflowNodeExecution{
		SchemaVersion:  SchemaVersion,
		ID:             nodeExecutionID,
		ExecutionID:    execution.ID,
		NodeID:         node.ID,
		Attempt:        attempt,
		Iteration:      iteration,
		Status:         NodeExecutionStatusReady,
		IdempotencyKey: fmt.Sprintf("%s/%s/%d/%d", execution.ID, node.ID, iteration, attempt),
		ScheduledAt:    context.Now,
		ActionKind:     &actionKind,
		RunnerRefs:     []WorkflowActionRunnerRef{},
		ActivityRefs:   []WorkflowActivityRef{},
	}
	execution.NodeExecutions = append(execution.NodeExecutions, nodeExecution)
	if err := appendEvent(execution, events, context, EventNodeScheduled, WorkflowEvent{
		NodeID:          node.ID,
		NodeExecutionID: nodeExecution.ID,
		TokenID:         execution.Tokens[tokenIndex].ID,
		Message:         fmt.Sprintf("action node %s scheduled", node.ID),
	}); err != nil {
		return false, err
	}
	return true, nil
}

func processANDGatewayToken(execution *WorkflowExecution, graph WorkflowGraph, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	iteration := execution.Tokens[tokenIndex].Iteration
	tokenIndexes := activeTokenIndexesForNodeAndIteration(*execution, node.ID, iteration)
	if gatewayAlreadyResolved(*execution, node.ID, iteration) {
		if err := consumeGatewayArrivals(execution, tokenIndexes, context.Now); err != nil {
			return false, err
		}
		return true, nil
	}
	required := requiredIncomingEdgeIDs(node, graph)
	if !activeTokensCoverEdges(*execution, tokenIndexes, required) {
		return false, nil
	}
	if err := consumeGatewayArrivals(execution, tokenIndexes, context.Now); err != nil {
		return false, err
	}
	nodeExecution, err := addControlNodeExecution(execution, context, node.ID, iteration)
	if err != nil {
		return false, err
	}
	if err := appendEvent(execution, events, context, EventGatewayResolved, WorkflowEvent{
		NodeID:          node.ID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("AND gateway %s resolved", node.ID),
	}); err != nil {
		return false, err
	}
	if err := emitMatchingOutgoingTokens(execution, graph, context, node.ID, iteration, allMatchingEdges); err != nil {
		return false, err
	}
	return true, nil
}

func processORGatewayToken(execution *WorkflowExecution, graph WorkflowGraph, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	iteration := execution.Tokens[tokenIndex].Iteration
	tokenIndexes := activeTokenIndexesForNodeAndIteration(*execution, node.ID, iteration)
	if gatewayAlreadyResolved(*execution, node.ID, iteration) {
		if err := consumeGatewayArrivals(execution, tokenIndexes, context.Now); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := consumeGatewayArrivals(execution, tokenIndexes, context.Now); err != nil {
		return false, err
	}
	nodeExecution, err := addControlNodeExecution(execution, context, node.ID, iteration)
	if err != nil {
		return false, err
	}
	if err := appendEvent(execution, events, context, EventGatewayResolved, WorkflowEvent{
		NodeID:          node.ID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("OR gateway %s resolved", node.ID),
	}); err != nil {
		return false, err
	}
	if err := emitMatchingOutgoingTokens(execution, graph, context, node.ID, iteration, allMatchingEdges); err != nil {
		return false, err
	}
	return true, nil
}

func processXORGatewayToken(execution *WorkflowExecution, graph WorkflowGraph, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	iteration := execution.Tokens[tokenIndex].Iteration
	tokenIndexes := activeTokenIndexesForNodeAndIteration(*execution, node.ID, iteration)
	if gatewayAlreadyResolved(*execution, node.ID, iteration) {
		if err := consumeGatewayArrivals(execution, tokenIndexes, context.Now); err != nil {
			return false, err
		}
		return true, nil
	}
	if len(tokenIndexes) > 1 {
		if err := failExecution(execution, events, context, TerminalReasonActionFailed, fmt.Sprintf("XOR gateway %s received %d simultaneous inputs", node.ID, len(tokenIndexes))); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := consumeGatewayArrivals(execution, tokenIndexes, context.Now); err != nil {
		return false, err
	}
	nodeExecution, err := addControlNodeExecution(execution, context, node.ID, iteration)
	if err != nil {
		return false, err
	}
	if err := appendEvent(execution, events, context, EventGatewayResolved, WorkflowEvent{
		NodeID:          node.ID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("XOR gateway %s resolved", node.ID),
	}); err != nil {
		return false, err
	}
	if err := emitMatchingOutgoingTokens(execution, graph, context, node.ID, iteration, exactlyOneMatchingEdge); err != nil {
		return false, err
	}
	return true, nil
}

func processLoopGuardToken(execution *WorkflowExecution, graph WorkflowGraph, tokenIndex int, node WorkflowNode, context TransitionContext, events *[]WorkflowEvent) (bool, error) {
	if node.LoopGuard == nil {
		return false, fmt.Errorf("loop guard node %s has no loop guard config", node.ID)
	}
	if err := consumeToken(execution, tokenIndex, context.Now); err != nil {
		return false, err
	}
	iteration := execution.Tokens[tokenIndex].Iteration
	nodeExecution, err := addControlNodeExecution(execution, context, node.ID, iteration)
	if err != nil {
		return false, err
	}
	count := incrementLoopIteration(execution, node.ID)
	decision := loopGuardDecision(*node.LoopGuard, *execution, count)
	if err := applyLoopGuardDecision(execution, graph, context, events, nodeExecution, iteration, decision, node.LoopGuard.LimitPolicy); err != nil {
		return false, err
	}
	return true, nil
}

type loopGuardDecisionKind string

const (
	loopDecisionContinue loopGuardDecisionKind = "continue"
	loopDecisionExit     loopGuardDecisionKind = "exit"
	loopDecisionLimit    loopGuardDecisionKind = "limit_reached"
)

func loopGuardDecision(config WorkflowLoopGuardConfig, execution WorkflowExecution, count int) loopGuardDecisionKind {
	exitMatched := config.ExitCondition != nil && conditionMatches(*config.ExitCondition, execution)
	if exitMatched {
		return loopDecisionExit
	}
	continueMatched := config.ContinueCondition == nil || conditionMatches(*config.ContinueCondition, execution)
	if config.MaxIterations != nil && count >= *config.MaxIterations && continueMatched {
		return loopDecisionLimit
	}
	if continueMatched {
		return loopDecisionContinue
	}
	return loopDecisionExit
}

func applyLoopGuardDecision(execution *WorkflowExecution, graph WorkflowGraph, context TransitionContext, events *[]WorkflowEvent, nodeExecution WorkflowNodeExecution, iteration int, decision loopGuardDecisionKind, policy WorkflowLoopLimitPolicy) error {
	if err := appendLoopAdvancedEvent(execution, events, context, nodeExecution, string(decision)); err != nil {
		return err
	}
	switch decision {
	case loopDecisionContinue:
		return emitLoopTokens(execution, graph, context, nodeExecution.NodeID, iteration+1, EdgeKindLoopContinue)
	case loopDecisionExit:
		return emitLoopTokens(execution, graph, context, nodeExecution.NodeID, iteration, EdgeKindLoopExit)
	case loopDecisionLimit:
		return applyLoopLimitPolicy(execution, events, context, policy)
	default:
		return fmt.Errorf("unsupported loop decision %q", decision)
	}
}

func appendLoopAdvancedEvent(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, nodeExecution WorkflowNodeExecution, decision string) error {
	details, err := json.Marshal(struct {
		Decision string `json:"decision"`
	}{Decision: decision})
	if err != nil {
		return err
	}
	return appendEvent(execution, events, context, EventLoopAdvanced, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         fmt.Sprintf("loop guard %s selected %s", nodeExecution.NodeID, decision),
		Details:         details,
	})
}

func applyLoopLimitPolicy(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, policy WorkflowLoopLimitPolicy) error {
	switch policy {
	case LoopLimitCompleted:
		return completeExecution(execution, events, context, TerminalReasonLimitReached, "workflow loop limit reached")
	case LoopLimitFailed:
		return failExecution(execution, events, context, TerminalReasonLimitReached, "workflow loop limit reached")
	case LoopLimitStopped:
		return stopExecution(execution, events, context, TerminalReasonLimitReached, "workflow loop limit reached")
	default:
		return fmt.Errorf("unsupported loop limit policy %q", policy)
	}
}

func addControlNodeExecution(execution *WorkflowExecution, context TransitionContext, nodeID string, iteration int) (WorkflowNodeExecution, error) {
	nodeExecutionID, err := context.NewID("workflow_node_execution")
	if err != nil {
		return WorkflowNodeExecution{}, fmt.Errorf("create node execution id: %w", err)
	}
	attempt := nextNodeAttempt(*execution, nodeID)
	nodeExecution := WorkflowNodeExecution{
		SchemaVersion:  SchemaVersion,
		ID:             nodeExecutionID,
		ExecutionID:    execution.ID,
		NodeID:         nodeID,
		Attempt:        attempt,
		Iteration:      iteration,
		Status:         NodeExecutionStatusSucceeded,
		IdempotencyKey: fmt.Sprintf("%s/%s/%d/%d", execution.ID, nodeID, iteration, attempt),
		ScheduledAt:    context.Now,
		StartedAt:      context.Now,
		CompletedAt:    context.Now,
		RunnerRefs:     []WorkflowActionRunnerRef{},
		ActivityRefs:   []WorkflowActivityRef{},
	}
	execution.NodeExecutions = append(execution.NodeExecutions, nodeExecution)
	return nodeExecution, nil
}

func emitMatchingOutgoingTokens(execution *WorkflowExecution, graph WorkflowGraph, context TransitionContext, nodeID string, iteration int, selector outgoingSelector) error {
	outgoing := outgoingEdges(graph, nodeID)
	matches := make([]WorkflowEdge, 0, len(outgoing))
	for _, edge := range outgoing {
		if edge.Kind != "" && edge.Kind != EdgeKindNormal {
			continue
		}
		if edge.Condition == nil || conditionMatches(*edge.Condition, *execution) {
			matches = append(matches, edge)
		}
	}
	selected, err := selector(nodeID, matches)
	if err != nil {
		return err
	}
	for _, edge := range selected {
		if err := emitToken(execution, context, edge.ToNodeID, nodeID, edge.ID, iteration); err != nil {
			return err
		}
	}
	return nil
}

type outgoingSelector func(nodeID string, matches []WorkflowEdge) ([]WorkflowEdge, error)

func allMatchingEdges(_ string, matches []WorkflowEdge) ([]WorkflowEdge, error) {
	if len(matches) == 0 {
		return nil, errors.New("workflow routing matched no outgoing edges")
	}
	return matches, nil
}

func exactlyOneMatchingEdge(nodeID string, matches []WorkflowEdge) ([]WorkflowEdge, error) {
	if len(matches) != 1 {
		return nil, fmt.Errorf("XOR gateway %s matched %d outgoing edges", nodeID, len(matches))
	}
	return matches, nil
}

func emitLoopTokens(execution *WorkflowExecution, graph WorkflowGraph, context TransitionContext, nodeID string, iteration int, edgeKind WorkflowEdgeKind) error {
	matches := []WorkflowEdge{}
	for _, edge := range outgoingEdges(graph, nodeID) {
		if edge.Kind == edgeKind {
			matches = append(matches, edge)
		}
	}
	if len(matches) == 0 {
		return fmt.Errorf("loop guard %s has no %s outgoing edges", nodeID, edgeKind)
	}
	for _, edge := range matches {
		if err := emitToken(execution, context, edge.ToNodeID, nodeID, edge.ID, iteration); err != nil {
			return err
		}
	}
	return nil
}

func emitToken(execution *WorkflowExecution, context TransitionContext, nodeID string, sourceNodeID string, edgeID string, iteration int) error {
	tokenID, err := context.NewID("workflow_token")
	if err != nil {
		return fmt.Errorf("create workflow token id: %w", err)
	}
	execution.Tokens = append(execution.Tokens, WorkflowToken{
		SchemaVersion: SchemaVersion,
		ID:            tokenID,
		ExecutionID:   execution.ID,
		NodeID:        nodeID,
		SourceNodeID:  sourceNodeID,
		EdgeID:        edgeID,
		Iteration:     iteration,
		Status:        TokenStatusActive,
		CreatedAt:     context.Now,
	})
	execution.UpdatedAt = context.Now
	return nil
}

func consumeToken(execution *WorkflowExecution, tokenIndex int, now string) error {
	if tokenIndex < 0 || tokenIndex >= len(execution.Tokens) {
		return fmt.Errorf("token index %d is out of range", tokenIndex)
	}
	if execution.Tokens[tokenIndex].Status != TokenStatusActive {
		return fmt.Errorf("token %s is %s, not active", execution.Tokens[tokenIndex].ID, execution.Tokens[tokenIndex].Status)
	}
	execution.Tokens[tokenIndex].Status = TokenStatusCompleted
	execution.Tokens[tokenIndex].CompletedAt = now
	execution.UpdatedAt = now
	return nil
}

func appendEvent(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, eventType WorkflowEventType, draft WorkflowEvent) error {
	eventID, err := context.NewID("workflow_event")
	if err != nil {
		return fmt.Errorf("create workflow event id: %w", err)
	}
	execution.LastEventOrdinal++
	event := WorkflowEvent{
		SchemaVersion:       SchemaVersion,
		ID:                  eventID,
		WorkspaceID:         execution.WorkspaceID,
		DefinitionID:        execution.DefinitionID,
		DefinitionVersionID: execution.DefinitionVersionID,
		ExecutionID:         execution.ID,
		Ordinal:             execution.LastEventOrdinal,
		Type:                eventType,
		NodeID:              draft.NodeID,
		NodeExecutionID:     draft.NodeExecutionID,
		TokenID:             draft.TokenID,
		RunnerKind:          draft.RunnerKind,
		CreatedAt:           context.Now,
		Message:             draft.Message,
		Details:             draft.Details,
	}
	*events = append(*events, event)
	execution.UpdatedAt = context.Now
	return nil
}

func conditionMatches(condition WorkflowCondition, execution WorkflowExecution) bool {
	matched := conditionMatchesRaw(condition, execution)
	if condition.Invert {
		return !matched
	}
	return matched
}

func conditionMatchesRaw(condition WorkflowCondition, execution WorkflowExecution) bool {
	switch condition.Kind {
	case "", ConditionAlways:
		return true
	case ConditionActionStatus:
		return actionStatusConditionMatches(condition, execution)
	case ConditionActionSignal:
		return actionSignalConditionMatches(condition, execution)
	case ConditionScriptExitCode:
		return scriptExitCodeConditionMatches(condition, execution)
	default:
		return false
	}
}

func actionStatusConditionMatches(condition WorkflowCondition, execution WorkflowExecution) bool {
	nodeExecution, ok := latestNodeExecution(execution, condition.NodeID)
	return ok && condition.Status != nil && nodeExecution.Status == *condition.Status
}

func actionSignalConditionMatches(condition WorkflowCondition, execution WorkflowExecution) bool {
	nodeExecution, ok := latestNodeExecution(execution, condition.NodeID)
	if !ok || nodeExecution.Result == nil {
		return false
	}
	for _, signal := range nodeExecution.Result.Signals {
		if signal.Name == condition.SignalName && (condition.SignalValue == "" || signal.Value == condition.SignalValue) {
			return true
		}
	}
	return false
}

func scriptExitCodeConditionMatches(condition WorkflowCondition, execution WorkflowExecution) bool {
	nodeExecution, ok := latestNodeExecution(execution, condition.NodeID)
	return ok &&
		nodeExecution.Result != nil &&
		nodeExecution.Result.ExitCode != nil &&
		condition.ExitCode != nil &&
		*nodeExecution.Result.ExitCode == *condition.ExitCode
}

func latestNodeExecution(execution WorkflowExecution, nodeID string) (WorkflowNodeExecution, bool) {
	for index := len(execution.NodeExecutions) - 1; index >= 0; index-- {
		if execution.NodeExecutions[index].NodeID == nodeID {
			return execution.NodeExecutions[index], true
		}
	}
	return WorkflowNodeExecution{}, false
}

func normalizeActionResult(result WorkflowActionResult) WorkflowActionResult {
	if result.Signals == nil {
		result.Signals = []WorkflowActionSignal{}
	}
	if result.FilePaths == nil {
		result.FilePaths = []string{}
	}
	return result
}

func startNode(graph WorkflowGraph) (WorkflowNode, bool) {
	for _, node := range graph.Nodes {
		if node.Kind == NodeKindStart {
			return node, true
		}
	}
	return WorkflowNode{}, false
}

func nodeByID(graph WorkflowGraph, nodeID string) (WorkflowNode, bool) {
	for _, node := range graph.Nodes {
		if node.ID == nodeID {
			return node, true
		}
	}
	return WorkflowNode{}, false
}

func outgoingEdges(graph WorkflowGraph, nodeID string) []WorkflowEdge {
	edges := []WorkflowEdge{}
	for _, edge := range graph.Edges {
		if edge.FromNodeID == nodeID {
			edges = append(edges, edge)
		}
	}
	return edges
}

func incomingEdges(graph WorkflowGraph, nodeID string) []WorkflowEdge {
	edges := []WorkflowEdge{}
	for _, edge := range graph.Edges {
		if edge.ToNodeID == nodeID {
			edges = append(edges, edge)
		}
	}
	return edges
}

func requiredIncomingEdgeIDs(node WorkflowNode, graph WorkflowGraph) []string {
	if node.Gateway != nil && len(node.Gateway.RequiredIncoming) > 0 {
		return append([]string{}, node.Gateway.RequiredIncoming...)
	}
	edges := incomingEdges(graph, node.ID)
	result := make([]string, 0, len(edges))
	for _, edge := range edges {
		result = append(result, edge.ID)
	}
	return result
}

func activeTokenIndexes(execution WorkflowExecution) []int {
	indexes := []int{}
	for index, token := range execution.Tokens {
		if token.Status == TokenStatusActive {
			indexes = append(indexes, index)
		}
	}
	return indexes
}

func activeTokenIndexesForNodeAndIteration(execution WorkflowExecution, nodeID string, iteration int) []int {
	indexes := []int{}
	for index, token := range execution.Tokens {
		if token.Status == TokenStatusActive && token.NodeID == nodeID && token.Iteration == iteration {
			indexes = append(indexes, index)
		}
	}
	return indexes
}

func executionReachedEndNode(execution WorkflowExecution, graph WorkflowGraph) bool {
	endNodeIDs := map[string]bool{}
	for _, node := range graph.Nodes {
		if node.Kind == NodeKindEnd {
			endNodeIDs[node.ID] = true
		}
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if endNodeIDs[nodeExecution.NodeID] && nodeExecution.Status == NodeExecutionStatusSucceeded {
			return true
		}
	}
	return false
}

func nodeExecutionIndex(execution WorkflowExecution, nodeExecutionID string) int {
	for index, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.ID == nodeExecutionID {
			return index
		}
	}
	return -1
}

func nodeExecutionByID(execution WorkflowExecution, nodeExecutionID string) WorkflowNodeExecution {
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowNodeExecution{}
	}
	return execution.NodeExecutions[index]
}

func nextNodeAttempt(execution WorkflowExecution, nodeID string) int {
	attempt := 1
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID {
			attempt++
		}
	}
	return attempt
}

func incrementLoopIteration(execution *WorkflowExecution, nodeID string) int {
	for index := range execution.LoopIterations {
		if execution.LoopIterations[index].NodeID == nodeID {
			execution.LoopIterations[index].Count++
			return execution.LoopIterations[index].Count
		}
	}
	execution.LoopIterations = append(execution.LoopIterations, WorkflowLoopIteration{
		NodeID: nodeID,
		Count:  1,
	})
	return 1
}

func hasActiveTokens(execution WorkflowExecution) bool {
	for _, token := range execution.Tokens {
		if token.Status == TokenStatusActive {
			return true
		}
	}
	return false
}

func hasActiveNodeExecutions(execution WorkflowExecution) bool {
	for _, nodeExecution := range execution.NodeExecutions {
		if isActiveNodeExecutionStatus(nodeExecution.Status) {
			return true
		}
	}
	return false
}

func refreshActiveNodeExecutionIDs(execution *WorkflowExecution) {
	ids := []string{}
	for _, nodeExecution := range execution.NodeExecutions {
		if isActiveNodeExecutionStatus(nodeExecution.Status) {
			ids = append(ids, nodeExecution.ID)
		}
	}
	execution.ActiveNodeExecutionIDs = ids
}

func isActiveNodeExecutionStatus(status WorkflowNodeExecutionStatus) bool {
	return status == NodeExecutionStatusReady ||
		status == NodeExecutionStatusRunning ||
		status == NodeExecutionStatusWaitingApproval ||
		status == NodeExecutionStatusRecoveryRequired
}

func isTerminalExecutionStatus(status WorkflowExecutionStatus) bool {
	return status == ExecutionStatusCompleted ||
		status == ExecutionStatusFailed ||
		status == ExecutionStatusStopped ||
		status == ExecutionStatusCancelled
}

func nonEmpty(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
