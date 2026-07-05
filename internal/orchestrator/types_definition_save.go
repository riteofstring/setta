package orchestrator

type WorkflowDefinitionSaveOperation string

const (
	WorkflowDefinitionSaveCreate WorkflowDefinitionSaveOperation = "create"
	WorkflowDefinitionSaveUpdate WorkflowDefinitionSaveOperation = "update"
)

var workflowDefinitionSaveOperationValues = []WorkflowDefinitionSaveOperation{
	WorkflowDefinitionSaveCreate,
	WorkflowDefinitionSaveUpdate,
}

type WorkflowDefinitionSaveInput struct {
	Operation    WorkflowDefinitionSaveOperation `json:"operation"`
	DefinitionID string                          `json:"definitionId"`
	Name         string                          `json:"name"`
	Description  string                          `json:"description"`
	Graph        WorkflowGraph                   `json:"graph"`
}

type WorkflowDefinitionSaveResult struct {
	Operation  WorkflowDefinitionSaveOperation `json:"operation"`
	Saved      bool                            `json:"saved"`
	Validation WorkflowValidationResult        `json:"validation"`
	Definition *WorkflowDefinition             `json:"definition"`
}
