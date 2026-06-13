package orchestrator

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const workflowValidatorRulesFingerprint = "workflow-validator:v1"

func workflowValidationSnapshotForDefinition(definition WorkflowDefinition, registry RunnerRegistry, validatedAt string) (WorkflowValidationSnapshot, error) {
	graphFingerprint, err := workflowValidationGraphFingerprint(definition.Graph)
	if err != nil {
		return WorkflowValidationSnapshot{}, err
	}
	return WorkflowValidationSnapshot{
		SchemaVersion:        SchemaVersion,
		WorkspaceID:          definition.WorkspaceID,
		DefinitionID:         definition.ID,
		GraphFingerprint:     graphFingerprint,
		ValidatorFingerprint: registry.validationFingerprint(),
		Result:               ValidateGraph(definition.Graph, registry),
		ValidatedAt:          validatedAt,
	}, nil
}

func workflowValidationState(graph WorkflowGraph, draftRevision string, registry RunnerRegistry, snapshot *WorkflowValidationSnapshot) (WorkflowDefinitionValidationState, error) {
	graphFingerprint, err := workflowValidationGraphFingerprint(graph)
	if err != nil {
		return WorkflowDefinitionValidationState{}, err
	}
	validatorFingerprint := registry.validationFingerprint()
	state := WorkflowDefinitionValidationState{
		Status:                      WorkflowValidationNotValidated,
		CurrentGraphFingerprint:     graphFingerprint,
		CurrentValidatorFingerprint: validatorFingerprint,
		CurrentDraftRevision:        draftRevision,
		Snapshot:                    snapshot,
	}
	if snapshot == nil {
		return state, nil
	}
	if snapshot.GraphFingerprint == graphFingerprint && snapshot.ValidatorFingerprint == validatorFingerprint {
		state.Status = WorkflowValidationCurrent
		return state, nil
	}
	state.Status = WorkflowValidationStale
	return state, nil
}

func workflowValidationGraphFingerprint(graph WorkflowGraph) (string, error) {
	canonical := canonicalWorkflowValidationGraph(graph)
	payload, err := json.Marshal(canonical)
	if err != nil {
		return "", fmt.Errorf("encode workflow validation fingerprint graph: %w", err)
	}
	digest := sha256.Sum256(payload)
	return "sha256:" + hex.EncodeToString(digest[:]), nil
}

func canonicalWorkflowValidationGraph(graph WorkflowGraph) WorkflowGraph {
	normalized := normalizeWorkflowGraph(graph)
	nodes := append([]WorkflowNode{}, normalized.Nodes...)
	edges := append([]WorkflowEdge{}, normalized.Edges...)
	sort.Slice(nodes, func(left int, right int) bool {
		return nodes[left].ID < nodes[right].ID
	})
	sort.Slice(edges, func(left int, right int) bool {
		return edges[left].ID < edges[right].ID
	})
	for index := range nodes {
		if nodes[index].Gateway != nil {
			nodes[index].Gateway = &WorkflowGatewayConfig{
				RequiredIncoming: sortedStrings(nodes[index].Gateway.RequiredIncoming),
			}
		}
	}
	return WorkflowGraph{
		Nodes:  nodes,
		Edges:  edges,
		Layout: WorkflowGraphLayout{Nodes: []WorkflowGraphNodeLayout{}},
	}
}

func (registry RunnerRegistry) validationFingerprint() string {
	kinds := make([]string, 0, len(registry.actionKinds))
	for kind := range registry.actionKinds {
		kinds = append(kinds, string(kind))
	}
	sort.Strings(kinds)
	return workflowValidatorRulesFingerprint + ";actions=" + strings.Join(kinds, ",")
}

func sortedStrings(values []string) []string {
	result := append([]string{}, values...)
	sort.Strings(result)
	return result
}
