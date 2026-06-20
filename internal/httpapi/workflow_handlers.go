package httpapi

import "net/http"

func (handler handler) listWorkflowDefinitions(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ListWorkflowDefinitionsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	definitions, err := service.ListDefinitions(payload.WorkspaceID)
	if err != nil {
		writeWorkflowError(response, "list_workflow_definitions_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListWorkflowDefinitionsResponse{Definitions: definitions})
}

func (handler handler) createWorkflowDefinition(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload CreateWorkflowDefinitionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	definition, err := service.CreateDefinition(payload.WorkspaceID, payload.Name, payload.Description, payload.Graph)
	if err != nil {
		writeWorkflowError(response, "create_workflow_definition_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, definition)
}

func (handler handler) readWorkflowDefinition(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ReadWorkflowDefinitionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	definition, err := service.ReadDefinition(payload.WorkspaceID, payload.DefinitionID)
	if err != nil {
		writeWorkflowError(response, "read_workflow_definition_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, definition)
}

func (handler handler) updateWorkflowDefinition(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload UpdateWorkflowDefinitionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	definition, err := service.UpdateDefinition(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.Name, payload.Description, payload.Graph)
	if err != nil {
		writeWorkflowError(response, "update_workflow_definition_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, definition)
}

func (handler handler) deleteWorkflowDefinition(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload DeleteWorkflowDefinitionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if err := service.DeleteDefinition(payload.WorkspaceID, payload.DefinitionID); err != nil {
		writeWorkflowError(response, "delete_workflow_definition_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, DeleteWorkflowDefinitionResponse{Deleted: true})
}

func (handler handler) validateWorkflowDefinition(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ValidateWorkflowDefinitionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ValidateDefinition(payload.WorkspaceID, payload.Graph)
	if err != nil {
		writeWorkflowError(response, "validate_workflow_definition_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) validateWorkflowDefinitionDraft(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ValidateWorkflowDefinitionDraftRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.ValidateDefinitionDraft(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision)
	if err != nil {
		writeWorkflowError(response, "validate_workflow_definition_draft_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) updateWorkflowDefinitionLayout(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload UpdateWorkflowDefinitionLayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.UpdateDefinitionLayout(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.Positions)
	if err != nil {
		writeWorkflowError(response, "update_workflow_definition_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) addWorkflowNode(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload AddWorkflowNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.AddDefinitionNode(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.NodeType, payload.Position)
	if err != nil {
		writeWorkflowError(response, "add_workflow_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) addWorkflowEdge(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload AddWorkflowEdgeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.AddDefinitionEdge(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.Connection)
	if err != nil {
		writeWorkflowError(response, "add_workflow_edge_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) deleteWorkflowNodes(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload DeleteWorkflowNodesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.DeleteDefinitionNodes(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.NodeIDs)
	if err != nil {
		writeWorkflowError(response, "delete_workflow_nodes_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) deleteWorkflowEdges(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload DeleteWorkflowEdgesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.DeleteDefinitionEdges(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.EdgeIDs)
	if err != nil {
		writeWorkflowError(response, "delete_workflow_edges_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) updateWorkflowNode(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload UpdateWorkflowNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.UpdateDefinitionNode(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.Node)
	if err != nil {
		writeWorkflowError(response, "update_workflow_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) updateWorkflowEdge(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload UpdateWorkflowEdgeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, err := service.UpdateDefinitionEdge(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.Edge)
	if err != nil {
		writeWorkflowError(response, "update_workflow_edge_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, projection)
}

func (handler handler) updateWorkflowDefinitionSettings(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload UpdateWorkflowDefinitionSettingsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	definition, err := service.UpdateDefinitionSettings(payload.WorkspaceID, payload.DefinitionID, payload.ExpectedRevision, payload.Name, payload.Description)
	if err != nil {
		writeWorkflowError(response, "update_workflow_definition_settings_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, definition)
}

func (handler handler) startWorkflowExecution(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload StartWorkflowExecutionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	execution, err := service.StartExecution(payload.WorkspaceID, payload.DefinitionID, payload.VersionID)
	if err != nil {
		writeWorkflowError(response, "start_workflow_execution_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, execution)
}

func (handler handler) cancelWorkflowExecution(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload CancelWorkflowExecutionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	execution, err := service.CancelExecution(payload.WorkspaceID, payload.ExecutionID)
	if err != nil {
		writeWorkflowError(response, "cancel_workflow_execution_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, execution)
}

func (handler handler) readWorkflowExecution(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ReadWorkflowExecutionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	execution, err := service.ReadExecution(payload.WorkspaceID, payload.ExecutionID)
	if err != nil {
		writeWorkflowError(response, "read_workflow_execution_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, execution)
}

func (handler handler) readWorkflowGraphProjection(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ReadWorkflowGraphProjectionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	projection, ok, err := service.ReadGraphProjection(payload.WorkspaceID, payload.DefinitionID, payload.VersionID, payload.ExecutionID)
	if err != nil {
		writeWorkflowError(response, "read_workflow_graph_projection_failed", err)
		return
	}
	if !ok {
		writeJSON(response, http.StatusOK, ReadWorkflowGraphProjectionResponse{})
		return
	}
	writeJSON(response, http.StatusOK, ReadWorkflowGraphProjectionResponse{Projection: &projection})
}

func (handler handler) readWorkflowGraphViewLayout(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ReadWorkflowGraphViewLayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	layout, err := service.ReadGraphViewLayout(payload.WorkspaceID, payload.Target)
	if err != nil {
		writeWorkflowError(response, "read_workflow_graph_view_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}

func (handler handler) updateWorkflowGraphViewLayout(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload UpdateWorkflowGraphViewLayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	layout, err := service.UpdateGraphViewLayout(payload.WorkspaceID, payload.Target, payload.Positions)
	if err != nil {
		writeWorkflowError(response, "update_workflow_graph_view_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}

func (handler handler) getWorkflowExecutionEvents(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload GetWorkflowExecutionEventsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.ReadExecutionEventPage(payload.WorkspaceID, payload.ExecutionID, payload.BeforeOrdinal, payload.Limit)
	if err != nil {
		writeWorkflowError(response, "get_workflow_execution_events_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) submitWorkflowApproval(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload SubmitWorkflowApprovalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	execution, err := service.SubmitApproval(payload.WorkspaceID, payload.ExecutionID, payload.NodeExecutionID, payload.ApprovalID, payload.Approved, payload.Response, payload.Answers, payload.Cancelled)
	if err != nil {
		writeWorkflowError(response, "submit_workflow_approval_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, execution)
}
