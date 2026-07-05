package httpapi

import (
	"errors"
	"net/http"

	"setta/internal/orchestrator"
	"setta/internal/workflowaudit"
)

func (handler handler) readWorkflowSchema(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	schema, err := service.WorkflowSchema()
	if err != nil {
		writeWorkflowError(response, "read_workflow_schema_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, schema)
}

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
	definition, err := service.UpdateDefinition(payload.WorkspaceID, payload.DefinitionID, payload.Name, payload.Description, payload.Graph)
	if err != nil {
		writeWorkflowError(response, "update_workflow_definition_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, definition)
}

func (handler handler) saveWorkflowDefinition(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	auditService := requireWorkflowAuditService(response, handler.workflowAuditService)
	if service == nil || auditService == nil {
		return
	}
	var payload SaveWorkflowDefinitionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SaveDefinition(payload.WorkspaceID, payload.Input)
	if err != nil {
		if auditErr := recordWorkflowDefinitionSaveAudit(request, auditService, payload, result, err); auditErr != nil {
			writeWorkflowAuditError(response, auditErr)
			return
		}
		writeWorkflowError(response, "save_workflow_definition_failed", err)
		return
	}
	if err := recordWorkflowDefinitionSaveAudit(request, auditService, payload, result, nil); err != nil {
		writeWorkflowAuditError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
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

func (handler handler) startWorkflowExecution(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	auditService := requireWorkflowAuditService(response, handler.workflowAuditService)
	if service == nil || auditService == nil {
		return
	}
	var payload StartWorkflowExecutionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	execution, validation, err := service.StartExecutionWithValidation(payload.WorkspaceID, payload.DefinitionID, payload.VersionID)
	if err != nil {
		if auditErr := recordWorkflowExecutionStartAudit(request, auditService, payload, execution, validation, err); auditErr != nil {
			writeWorkflowAuditError(response, auditErr)
			return
		}
		writeWorkflowError(response, "start_workflow_execution_failed", err)
		return
	}
	if err := recordWorkflowExecutionStartAudit(request, auditService, payload, execution, validation, nil); err != nil {
		writeWorkflowAuditError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, execution)
}

func recordWorkflowDefinitionSaveAudit(
	request *http.Request,
	auditService WorkflowAuditService,
	payload SaveWorkflowDefinitionRequest,
	result orchestrator.WorkflowDefinitionSaveResult,
	operationErr error,
) error {
	deviceSession, ok := authenticatedDeviceSession(request)
	if !ok {
		return errors.New("authenticated device session is required for workflow audit")
	}
	input := workflowaudit.RecordInput{
		AuthenticatedDeviceSession: deviceSession,
		CommandName:                workflowaudit.CommandWorkflowDefinitionsSave,
		WorkspaceID:                payload.WorkspaceID,
		DefinitionID:               payload.Input.DefinitionID,
		SaveOperation:              payload.Input.Operation,
	}
	if operationErr != nil {
		input.Outcome = workflowaudit.OutcomeFailed
		input.Validation = workflowAuditValidationFromError(operationErr)
		input.ErrorCode = workflowAuditErrorCode("save_workflow_definition_failed", operationErr)
		input.ErrorMessage = operationErr.Error()
		_, err := auditService.Record(request.Context(), input)
		return err
	}

	input.Outcome = workflowaudit.OutcomeWorkflowDefinitionUnsaved
	if result.Saved {
		input.Outcome = workflowaudit.OutcomeWorkflowDefinitionSaved
	}
	if result.Definition != nil {
		input.DefinitionID = result.Definition.ID
	}
	saved := result.Saved
	validation := result.Validation
	input.Saved = &saved
	input.Validation = &validation
	_, err := auditService.Record(request.Context(), input)
	return err
}

func recordWorkflowExecutionStartAudit(
	request *http.Request,
	auditService WorkflowAuditService,
	payload StartWorkflowExecutionRequest,
	execution orchestrator.WorkflowExecution,
	validation orchestrator.WorkflowValidationResult,
	operationErr error,
) error {
	deviceSession, ok := authenticatedDeviceSession(request)
	if !ok {
		return errors.New("authenticated device session is required for workflow audit")
	}
	input := workflowaudit.RecordInput{
		AuthenticatedDeviceSession: deviceSession,
		CommandName:                workflowaudit.CommandWorkflowExecutionsStart,
		WorkspaceID:                payload.WorkspaceID,
		DefinitionID:               payload.DefinitionID,
	}
	if operationErr != nil {
		input.Outcome = workflowaudit.OutcomeFailed
		input.Validation = workflowAuditValidationResult(validation, operationErr)
		input.ErrorCode = workflowAuditErrorCode("start_workflow_execution_failed", operationErr)
		input.ErrorMessage = operationErr.Error()
		if conflict, ok := orchestrator.IsWorkflowExecutionAlreadyRunning(operationErr); ok {
			activeExecution := conflict.ActiveExecution
			input.ActiveExecution = &activeExecution
		}
		_, err := auditService.Record(request.Context(), input)
		return err
	}

	input.Outcome = workflowaudit.OutcomeWorkflowExecutionStarted
	input.ExecutionID = execution.ID
	input.Validation = workflowAuditValidationResult(validation, nil)
	_, err := auditService.Record(request.Context(), input)
	return err
}

func workflowAuditValidationResult(result orchestrator.WorkflowValidationResult, err error) *orchestrator.WorkflowValidationResult {
	if result.Valid || result.Diagnostics != nil {
		validation := result
		return &validation
	}
	if err == nil {
		return nil
	}
	return workflowAuditValidationFromError(err)
}

func workflowAuditValidationFromError(err error) *orchestrator.WorkflowValidationResult {
	var validationErr *orchestrator.ValidationError
	if !errors.As(err, &validationErr) {
		return nil
	}
	validation := validationErr.Result
	return &validation
}

func workflowAuditErrorCode(defaultCode string, err error) string {
	var validationErr *orchestrator.ValidationError
	if errors.As(err, &validationErr) {
		return "workflow_validation_failed"
	}
	if _, ok := orchestrator.IsWorkflowExecutionAlreadyRunning(err); ok {
		return orchestrator.WorkflowExecutionAlreadyRunningCode
	}
	return defaultCode
}

func writeWorkflowAuditError(response http.ResponseWriter, err error) {
	writeError(response, http.StatusInternalServerError, "record_workflow_audit_failed", err.Error())
}

func (handler handler) listWorkflowExecutions(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ListWorkflowExecutionsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	executions, err := service.ListExecutionSummariesForDefinition(payload.WorkspaceID, payload.DefinitionID, payload.Limit)
	if err != nil {
		writeWorkflowError(response, "list_workflow_executions_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListWorkflowExecutionsResponse{Executions: executions})
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

func (handler handler) readWorkflowNodeTrajectory(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload ReadWorkflowNodeTrajectoryRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.ReadWorkflowNodeTrajectory(payload.WorkspaceID, payload.ExecutionID, payload.NodeExecutionID, payload.BeforeBlockOrdinal, payload.TranscriptLimit, payload.AfterItemID, payload.ItemLimit, payload.OutputLimit)
	if err != nil {
		writeWorkflowError(response, "read_workflow_node_trajectory_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) stopWorkflowNodeRun(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload StopWorkflowNodeRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	execution, err := service.StopWorkflowNodeRun(payload.WorkspaceID, payload.ExecutionID, payload.NodeExecutionID)
	if err != nil {
		writeWorkflowError(response, "stop_workflow_node_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, execution)
}

func (handler handler) steerWorkflowNodeRun(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload SteerWorkflowNodeRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SteerWorkflowNodeRun(payload.WorkspaceID, payload.ExecutionID, payload.NodeExecutionID, payload.Input)
	if err != nil {
		writeWorkflowError(response, "steer_workflow_node_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) retryWorkflowNodeRunLiveness(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	var payload RetryWorkflowNodeRunLivenessRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.RetryWorkflowNodeRunLiveness(request.Context(), payload.WorkspaceID, payload.ExecutionID, payload.NodeExecutionID)
	if err != nil {
		writeWorkflowError(response, "retry_workflow_node_run_liveness_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
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
